import { completeFromStream } from "../complete-from-stream.js";
import { normalizeHttpError } from "../shared/errors.js";
import { assertOnlySupportedFiles, buildAssistantMessage } from "../shared/messages.js";
import { ensureRecord, safeJsonParse, stringifyJson } from "../shared/json.js";
import { parseSSE } from "../shared/sse.js";
import { toOpenAITools } from "../shared/tools.js";
import { applyCredits, makeUsage } from "../shared/usage.js";
import type {
  AssistantStopReason,
  GenerateRequest,
  GenerateResult,
  Message,
  OpenAICompatibleConfig,
  Provider,
  StreamEvent,
  ToolCallBlock,
  Usage,
} from "../types.js";

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OAIContentPart[] | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

type OAIContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface SSEChunk {
  id?: string;
  choices?: Array<{
    index: number;
    delta: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_details?: Array<{
        type?: string;
        text?: string;
        summary?: string;
      }>;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    message?: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

type OpenAIStreamDelta = NonNullable<NonNullable<SSEChunk["choices"]>[number]>["delta"];

const ALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function encodeBase62(seed: number, length: number): string {
  let n = seed >>> 0;
  let out = "";
  for (let i = 0; i < length; i++) {
    if (n === 0) n = hash32(`${seed}:${i}:${out.length}`);
    out += ALNUM[n % ALNUM.length];
    n = Math.floor(n / ALNUM.length);
  }
  return out;
}

function createStrictToolCallIdFactory() {
  const used = new Set<string>();
  let seq = 0;

  return (seed: string): string => {
    let attempt = 0;
    while (attempt < 50_000) {
      const candidate = encodeBase62(hash32(`${seed}:${seq}:${attempt}`), 9);
      if (!used.has(candidate)) {
        used.add(candidate);
        seq++;
        return candidate;
      }
      attempt++;
    }
    throw new Error("Failed to generate unique strict tool call id");
  };
}

function normalizeToolCallIds(mode: OpenAICompatibleConfig["compat"]): boolean {
  return mode?.toolCallIdPolicy === "strict9";
}

function mapFinishReason(reason: string | null | undefined, hasTools: boolean): AssistantStopReason {
  if (reason === "tool_calls") return "tool_use";
  if (reason === "length") return "max_tokens";
  if (reason === "content_filter") return "error";
  if (hasTools) return "tool_use";
  return "stop";
}

function convertMessages(messages: Message[], systemPrompt: string | undefined, config: OpenAICompatibleConfig): OAIMessage[] {
  const result: OAIMessage[] = [];
  const strictIds = normalizeToolCallIds(config.compat);
  const makeStrictId = createStrictToolCallIdFactory();
  const pendingToolIds = new Map<string, string[]>();

  if (systemPrompt) result.push({ role: "system", content: systemPrompt });

  for (const message of messages) {
    if (message.role === "user") {
      assertOnlySupportedFiles(message.content, true, config.name);
      const parts: OAIContentPart[] = [];
      for (const part of message.content) {
        if (typeof part === "string") parts.push({ type: "text", text: part });
        else if (part.type === "text") parts.push({ type: "text", text: part.text });
        else {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${part.mediaType};base64,${part.data}` },
          });
        }
      }
      if (parts.length === 1 && parts[0]?.type === "text") result.push({ role: "user", content: parts[0].text });
      else result.push({ role: "user", content: parts });
      continue;
    }

    if (message.role === "assistant") {
      let text = "";
      const toolCalls: OAIToolCall[] = [];
      for (const block of message.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_call") {
          const mappedId = strictIds ? makeStrictId(block.id) : block.id;
          if (strictIds) {
            const queue = pendingToolIds.get(block.id) ?? [];
            queue.push(mappedId);
            pendingToolIds.set(block.id, queue);
          }
          toolCalls.push({
            id: mappedId,
            type: "function",
            function: { name: block.name, arguments: stringifyJson(block.args) },
          });
        }
      }
      const out: OAIMessage = { role: "assistant", content: text || null };
      if (toolCalls.length > 0) out.tool_calls = toolCalls;
      result.push(out);
      continue;
    }

    let toolCallId = message.callId;
    if (strictIds) {
      const queue = pendingToolIds.get(message.callId);
      const mapped = queue?.shift();
      if (!mapped) continue;
      toolCallId = mapped;
      if (queue && queue.length === 0) pendingToolIds.delete(message.callId);
    }
    const toolMessage: OAIMessage = {
      role: "tool",
      tool_call_id: toolCallId,
      content: stringifyJson(message.result),
    };
    if (config.compat?.requiresToolResultName) toolMessage.name = message.name;
    result.push(toolMessage);
  }

  return result;
}

function usageFromChunk(chunk: SSEChunk, config: OpenAICompatibleConfig): Usage | undefined {
  if (!chunk.usage) return undefined;
  return applyCredits(
    makeUsage(chunk.usage.prompt_tokens ?? 0, chunk.usage.completion_tokens ?? 0),
    config.creditsPerInputToken,
    config.creditsPerOutputToken,
  );
}

function thinkingFromDelta(delta: OpenAIStreamDelta, config: OpenAICompatibleConfig): string {
  if (config.compat?.thinkingFormat === "text") return delta.reasoning ?? "";
  if (config.compat?.thinkingFormat === "reasoning_details") {
    return (delta.reasoning_details ?? [])
      .map((detail: { text?: string; summary?: string }) => detail.text ?? detail.summary ?? "")
      .join("");
  }
  return "";
}

async function parseCompletionResponse(response: Response, config: OpenAICompatibleConfig): Promise<GenerateResult> {
  const payload = safeJsonParse<SSEChunk>(await response.text());
  if (!payload) throw new Error(`${config.name} returned invalid JSON.`);

  const choice = payload.choices?.[0];
  const message = choice?.message;
  const content = message?.content ?? "";
  const toolCalls: ToolCallBlock[] = (message?.tool_calls ?? []).map((call, index) => ({
    type: "tool_call",
    id: call.id ?? `${config.name}-${index}`,
    name: call.function?.name ?? "",
    args: ensureRecord(safeJsonParse(call.function?.arguments ?? "{}")),
  }));

  const usage = usageFromChunk(payload, config);
  const finishReason = mapFinishReason(choice?.finish_reason, toolCalls.length > 0);

  return {
    message: buildAssistantMessage(config.model, content ?? "", "", toolCalls, usage, finishReason),
    usage,
    finishReason,
    providerMeta: {
      model: config.model,
      requestId: response.headers.get("x-request-id") ?? response.headers.get("request-id") ?? undefined,
    },
  };
}

export function openAICompatible(config: OpenAICompatibleConfig): Provider {
  const baseURL = config.baseURL.replace(/\/+$/, "");
  const contextWindow = config.contextWindow ?? 128_000;

  const provider: Provider = {
    name: config.name,
    family: "openai-compatible",
    model: config.model,
    contextWindow,
    capabilities: {
      streaming: true,
      tools: true,
      images: true,
      thinking: config.compat?.thinkingFormat !== "none",
      usage: true,
    },

    async complete(request: GenerateRequest): Promise<GenerateResult> {
      const messages = convertMessages(request.messages, request.systemPrompt, config);
      const tools = request.tools?.length ? toOpenAITools(request.tools) : undefined;
      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        stream: false,
      };
      if (tools) body.tools = tools;
      if (request.maxOutputTokens !== undefined) {
        body[config.compat?.maxTokensField ?? "max_completion_tokens"] = request.maxOutputTokens;
      }
      if (request.temperature ?? config.temperature) body.temperature = request.temperature ?? config.temperature;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
      };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: request.signal,
      }).catch((error: unknown) => {
        throw new Error(`${config.name} connection failed: ${error instanceof Error ? error.message : String(error)}`);
      });

      if (!response.ok) {
        const normalized = await normalizeHttpError(config.name, response);
        throw new Error(normalized.error);
      }

      return parseCompletionResponse(response, config);
    },

    async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
      const messages = convertMessages(request.messages, request.systemPrompt, config);
      const tools = request.tools?.length ? toOpenAITools(request.tools) : undefined;

      const body: Record<string, unknown> = {
        model: config.model,
        messages,
        stream: true,
      };
      if (config.compat?.supportsUsageInStreaming !== false) {
        body.stream_options = { include_usage: true };
      }
      if (tools) body.tools = tools;
      if (request.temperature ?? config.temperature) body.temperature = request.temperature ?? config.temperature;
      if (request.maxOutputTokens !== undefined) {
        body[config.compat?.maxTokensField ?? "max_completion_tokens"] = request.maxOutputTokens;
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...config.headers,
      };
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

      let response: Response;
      try {
        response = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (error) {
        yield {
          type: "error",
          error: `${config.name} connection failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        };
        return;
      }

      if (!response.ok) {
        const normalized = await normalizeHttpError(config.name, response);
        yield { type: "error", ...normalized };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", error: `${config.name} response body missing`, retryable: false };
        return;
      }

      const toolBuffers = new Map<number, { callId: string; name: string; argsBuffer: string }>();
      let latestUsage: Usage | undefined;
      let latestFinishReason: AssistantStopReason | undefined;
      const flushToolCalls = function* (): Generator<StreamEvent> {
        for (const [, buffer] of toolBuffers) {
          yield {
            type: "tool_call",
            callId: buffer.callId,
            name: buffer.name,
            args: ensureRecord(safeJsonParse(buffer.argsBuffer || "{}")),
          };
        }
        toolBuffers.clear();
      };

      for await (const event of parseSSE(reader)) {
        if (event.data === "[DONE]") break;
        const chunk = safeJsonParse<SSEChunk>(event.data);
        if (!chunk) continue;

        const usage = usageFromChunk(chunk, config);
        if (usage) {
          latestUsage = usage;
          yield { type: "usage", usage };
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        latestFinishReason = mapFinishReason(choice.finish_reason, toolBuffers.size > 0);
        const delta = choice.delta;

        if (delta.content) yield { type: "text", delta: delta.content };
        const thinking = thinkingFromDelta(delta, config);
        if (thinking) yield { type: "thinking", delta: thinking };

        if (delta.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const existing = toolBuffers.get(toolCall.index);
            if (!existing) {
              const callId = toolCall.id ?? `${config.name}-${toolCall.index}`;
              const name = toolCall.function?.name ?? "";
              toolBuffers.set(toolCall.index, {
                callId,
                name,
                argsBuffer: toolCall.function?.arguments ?? "",
              });
              yield { type: "tool_start", callId, name };
            } else if (toolCall.function?.arguments) {
              existing.argsBuffer += toolCall.function.arguments;
              yield { type: "tool_delta", callId: existing.callId, argsDelta: toolCall.function.arguments };
            }
          }
        }

        if (choice.finish_reason === "tool_calls" || choice.finish_reason === "stop") {
          yield* flushToolCalls();
        }
      }

      if (toolBuffers.size > 0) yield* flushToolCalls();
      if (latestFinishReason) {
        yield {
          type: "usage",
          usage: latestUsage ?? makeUsage(),
          finishReason: latestFinishReason,
        };
      }
    },
  };

  return provider;
}

export async function completeOpenAICompatibleFromStream(
  config: OpenAICompatibleConfig,
  request: GenerateRequest,
): Promise<GenerateResult> {
  const provider = openAICompatible(config);
  return completeFromStream(provider, request);
}
