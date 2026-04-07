import { normalizeHttpError } from "../shared/errors.js";
import { assertOnlySupportedFiles, buildAssistantMessage } from "../shared/messages.js";
import { ensureRecord, safeJsonParse, stringifyJson } from "../shared/json.js";
import { parseSSE } from "../shared/sse.js";
import { toOpenAITools } from "../shared/tools.js";
import { applyCredits, makeUsage } from "../shared/usage.js";
import type { GenerateRequest, GenerateResult, Message, Provider, StreamEvent, ToolCallBlock, Usage } from "../types.js";

interface MistralMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

interface MistralChunk {
  choices?: Array<{
    index: number;
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

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
  return (seed: string) => {
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

function usageFromChunk(chunk: MistralChunk, options?: MistralOptions): Usage | undefined {
  if (!chunk.usage) return undefined;
  return applyCredits(
    makeUsage(chunk.usage.prompt_tokens ?? 0, chunk.usage.completion_tokens ?? 0),
    options?.creditsPerInputToken,
    options?.creditsPerOutputToken,
  );
}

function convertMessages(messages: Message[], systemPrompt: string | undefined, options?: MistralOptions): MistralMessage[] {
  const out: MistralMessage[] = [];
  const pendingToolIds = new Map<string, string[]>();
  const makeStrictId = options?.normalizeToolCallIds === "strict9" ? createStrictToolCallIdFactory() : null;

  if (systemPrompt) out.push({ role: "system", content: systemPrompt });

  for (const message of messages) {
    if (message.role === "user") {
      assertOnlySupportedFiles(message.content, true, "mistral");
      const parts = message.content.map((part) => {
        if (typeof part === "string") return { type: "text" as const, text: part };
        if (part.type === "text") return { type: "text" as const, text: part.text };
        return { type: "image_url" as const, image_url: { url: `data:${part.mediaType};base64,${part.data}` } };
      });
      if (parts.length === 1 && parts[0]?.type === "text") out.push({ role: "user", content: parts[0].text });
      else out.push({ role: "user", content: parts });
      continue;
    }

    if (message.role === "assistant") {
      let text = "";
      const toolCalls: NonNullable<MistralMessage["tool_calls"]> = [];
      for (const block of message.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_call") {
          const mappedId = makeStrictId ? makeStrictId(block.id) : block.id;
          if (makeStrictId) {
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
      const next: MistralMessage = { role: "assistant", content: text || null };
      if (toolCalls.length > 0) next.tool_calls = toolCalls;
      out.push(next);
      continue;
    }

    const queue = pendingToolIds.get(message.callId);
    const mappedId = makeStrictId ? queue?.shift() : message.callId;
    if (!mappedId) continue;
    if (makeStrictId && queue && queue.length === 0) pendingToolIds.delete(message.callId);
    out.push({
      role: "tool",
      content: stringifyJson(message.result),
      name: message.name,
      tool_call_id: mappedId,
    });
  }

  return out;
}

function mapFinishReason(reason: string | null | undefined, hasTools: boolean) {
  if (reason === "tool_calls") return "tool_use" as const;
  if (reason === "length") return "max_tokens" as const;
  if (hasTools) return "tool_use" as const;
  return "stop" as const;
}

export interface MistralOptions {
  apiKey?: string;
  baseURL?: string;
  contextWindow?: number;
  temperature?: number;
  normalizeToolCallIds?: "strict9" | "never";
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
}

export function mistral(model: string, options?: MistralOptions): Provider {
  const baseURL = (options?.baseURL ?? "https://api.mistral.ai/v1").replace(/\/+$/, "");

  return {
    name: "mistral",
    family: "mistral",
    model,
    contextWindow: options?.contextWindow ?? 128_000,
    capabilities: {
      streaming: true,
      tools: true,
      images: true,
      thinking: false,
      usage: true,
    },

    async complete(request: GenerateRequest): Promise<GenerateResult> {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(request.messages, request.systemPrompt, options),
        stream: false,
      };
      if (request.tools?.length) {
        body.tools = toOpenAITools(request.tools);
        body.parallel_tool_calls = true;
      }
      if (request.temperature ?? options?.temperature) body.temperature = request.temperature ?? options?.temperature;
      if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;

      const response = await fetch(`${baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options?.apiKey ?? globalThis.process?.env?.MISTRAL_API_KEY ?? ""}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      }).catch((error: unknown) => {
        throw new Error(`mistral connection failed: ${error instanceof Error ? error.message : String(error)}`);
      });

      if (!response.ok) {
        const normalized = await normalizeHttpError("mistral", response);
        throw new Error(normalized.error);
      }

      const payload = safeJsonParse<MistralChunk>(await response.text());
      if (!payload) throw new Error("mistral returned invalid JSON.");
      const choice = payload.choices?.[0];
      const toolCalls: ToolCallBlock[] = (choice?.message?.tool_calls ?? []).map((call, index) => ({
        type: "tool_call",
        id: call.id ?? `mistral-${index}`,
        name: call.function?.name ?? "",
        args: ensureRecord(safeJsonParse(call.function?.arguments ?? "{}")),
      }));
      const usage = usageFromChunk(payload, options);
      const finishReason = mapFinishReason(choice?.finish_reason, toolCalls.length > 0);

      return {
        message: buildAssistantMessage(model, choice?.message?.content ?? "", "", toolCalls, usage, finishReason),
        usage,
        finishReason,
        providerMeta: { model },
      };
    },

    async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(request.messages, request.systemPrompt, options),
        stream: true,
      };
      if (request.tools?.length) {
        body.tools = toOpenAITools(request.tools);
        body.parallel_tool_calls = true;
      }
      if (request.temperature ?? options?.temperature) body.temperature = request.temperature ?? options?.temperature;
      if (request.maxOutputTokens !== undefined) body.max_tokens = request.maxOutputTokens;

      let response: Response;
      try {
        response = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options?.apiKey ?? globalThis.process?.env?.MISTRAL_API_KEY ?? ""}`,
          },
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (error) {
        yield {
          type: "error",
          error: `mistral connection failed: ${error instanceof Error ? error.message : String(error)}`,
          retryable: true,
        };
        return;
      }

      if (!response.ok) {
        const normalized = await normalizeHttpError("mistral", response);
        yield { type: "error", ...normalized };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", error: "mistral response body missing", retryable: false };
        return;
      }

      const buffers = new Map<number, { callId: string; name: string; argsBuffer: string }>();
      let latestUsage: Usage | undefined;
      let latestFinishReason: GenerateResult["finishReason"] | undefined;
      const flush = function* () {
        for (const [, buffer] of buffers) {
          yield {
            type: "tool_call" as const,
            callId: buffer.callId,
            name: buffer.name,
            args: ensureRecord(safeJsonParse(buffer.argsBuffer || "{}")),
          };
        }
        buffers.clear();
      };

      for await (const event of parseSSE(reader)) {
        if (event.data === "[DONE]") break;
        const chunk = safeJsonParse<MistralChunk>(event.data);
        if (!chunk) continue;
        const usage = usageFromChunk(chunk, options);
        if (usage) {
          latestUsage = usage;
          yield { type: "usage", usage };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        latestFinishReason = mapFinishReason(choice.finish_reason, buffers.size > 0);
        if (choice.delta.content) yield { type: "text", delta: choice.delta.content };
        if (choice.delta.tool_calls) {
          for (const toolCall of choice.delta.tool_calls) {
            const existing = buffers.get(toolCall.index);
            if (!existing) {
              const callId = toolCall.id ?? `mistral-${toolCall.index}`;
              const name = toolCall.function?.name ?? "";
              buffers.set(toolCall.index, {
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
          yield* flush();
        }
      }

      if (buffers.size > 0) yield* flush();
      if (latestFinishReason) {
        yield {
          type: "usage",
          usage: latestUsage ?? makeUsage(),
          finishReason: latestFinishReason,
        };
      }
    },
  };
}
