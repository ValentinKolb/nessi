import { formatConnectionError, normalizeHttpError } from "../shared/errors.js";
import { assertOnlySupportedFiles, buildAssistantMessage } from "../shared/messages.js";
import { ensureRecord, safeJsonParse, stringifyJson } from "../shared/json.js";
import { openSSEStream } from "../shared/stream-helpers.js";
import { toAnthropicTools } from "../shared/tools.js";
import { applyCredits, makeUsage } from "../shared/usage.js";
import type { GenerateRequest, GenerateResult, Message, Provider, StreamEvent, ToolCallBlock } from "../types.js";

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: AnthropicBlock[];
};

type AnthropicResponse = {
  id?: string;
  model?: string;
  content?: Array<
    | { type: "text"; text?: string }
    | { type: "tool_use"; id: string; name: string; input?: Record<string, unknown> }
  >;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
};

type AnthropicStreamEvent = {
  message?: {
    id?: string;
    model?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  usage?: { input_tokens?: number; output_tokens?: number };
  content_block?: {
    type?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  index?: number;
  delta?: {
    type?: string;
    text?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
};

export type AnthropicOptions = {
  apiKey?: string;
  baseURL?: string;
  apiVersion?: string;
  contextWindow?: number;
  temperature?: number;
  maxOutputTokens?: number;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
};

const mapFinishReason = (reason: string | null | undefined, hasTools: boolean) => {
  if (reason === "tool_use") return "tool_use" as const;
  if (reason === "max_tokens") return "max_tokens" as const;
  if (hasTools) return "tool_use" as const;
  return "stop" as const;
};

const convertMessages = (messages: Message[]) => {
  const out: AnthropicMessage[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      assertOnlySupportedFiles(message.content, true, "anthropic");
      const content: AnthropicBlock[] = [];
      for (const part of message.content) {
        if (typeof part === "string") content.push({ type: "text", text: part });
        else if (part.type === "text") content.push({ type: "text", text: part.text });
        else content.push({
          type: "image",
          source: { type: "base64", media_type: part.mediaType, data: part.data },
        });
      }
      out.push({ role: "user", content });
      continue;
    }

    if (message.role === "assistant") {
      const content: AnthropicBlock[] = [];
      for (const block of message.content) {
        if (block.type === "text") content.push({ type: "text", text: block.text });
        else if (block.type === "tool_call") {
          content.push({
            type: "tool_use",
            id: block.id,
            name: block.name,
            input: block.args,
          });
        }
      }
      out.push({ role: "assistant", content });
      continue;
    }

    out.push({
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: message.callId,
        content: stringifyJson(message.result),
        is_error: message.isError,
      }],
    });
  }
  return out;
};

const usageFromValue = (
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
  options?: AnthropicOptions,
) =>
  applyCredits(
    makeUsage(usage?.input_tokens ?? 0, usage?.output_tokens ?? 0),
    options?.creditsPerInputToken,
    options?.creditsPerOutputToken,
  );

export const anthropic = (model: string, options?: AnthropicOptions): Provider => {
  const baseURL = (options?.baseURL ?? "https://api.anthropic.com").replace(/\/+$/, "");
  const apiVersion = options?.apiVersion ?? "2023-06-01";
  const maxOutputTokens = options?.maxOutputTokens ?? 1024;

  return {
    name: "anthropic",
    family: "anthropic",
    model,
    contextWindow: options?.contextWindow ?? 200_000,
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
        system: request.systemPrompt,
        messages: convertMessages(request.messages),
        max_tokens: request.maxOutputTokens ?? maxOutputTokens,
      };
      if (request.tools?.length) body.tools = toAnthropicTools(request.tools);
      if (request.temperature ?? options?.temperature) body.temperature = request.temperature ?? options?.temperature;

      const response = await fetch(`${baseURL}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": options?.apiKey ?? globalThis.process?.env?.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": apiVersion,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      }).catch((error: unknown) => {
        throw new Error(formatConnectionError("anthropic", error));
      });

      if (!response.ok) {
        const normalized = await normalizeHttpError("anthropic", response);
        throw new Error(normalized.error);
      }

      const payload = safeJsonParse<AnthropicResponse>(await response.text());
      if (!payload) throw new Error("anthropic returned invalid JSON.");
      const text = (payload.content ?? [])
        .filter((block): block is { type: "text"; text?: string } => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");
      const toolCalls: ToolCallBlock[] = (payload.content ?? [])
        .filter((block): block is { type: "tool_use"; id: string; name: string; input?: Record<string, unknown> } => block.type === "tool_use")
        .map((block) => ({
          type: "tool_call",
          id: block.id,
          name: block.name,
          args: block.input ?? {},
        }));
      const usage = usageFromValue(payload.usage, options);
      const finishReason = mapFinishReason(payload.stop_reason, toolCalls.length > 0);

      return {
        message: buildAssistantMessage(model, text, "", toolCalls, usage, finishReason),
        usage,
        finishReason,
        providerMeta: { model, requestId: payload.id },
      };
    },

    async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
      const body: Record<string, unknown> = {
        model,
        system: request.systemPrompt,
        messages: convertMessages(request.messages),
        max_tokens: request.maxOutputTokens ?? maxOutputTokens,
        stream: true,
      };
      if (request.tools?.length) body.tools = toAnthropicTools(request.tools);
      if (request.temperature ?? options?.temperature) body.temperature = request.temperature ?? options?.temperature;

      const result = await openSSEStream(
        `${baseURL}/v1/messages`,
        {
          "Content-Type": "application/json",
          "x-api-key": options?.apiKey ?? globalThis.process?.env?.ANTHROPIC_API_KEY ?? "",
          "anthropic-version": apiVersion,
        },
        body,
        "anthropic",
        request.signal,
      );

      if (!result.ok) {
        yield result.error;
        return;
      }

      const toolBuffers = new Map<number, { callId: string; name: string; argsBuffer: string }>();
      let latestUsage = makeUsage();
      let latestFinishReason: GenerateResult["finishReason"] | undefined;
      let syntheticIndex = 0;
      let sawToolCall = false;

      for await (const event of result.events) {
        if (event.data === "[DONE]") break;
        const payload = safeJsonParse<AnthropicStreamEvent>(event.data);
        if (!payload) continue;

        if (event.event === "message_start" && payload.message?.usage) {
          latestUsage = usageFromValue(payload.message.usage, options);
        }

        if (event.event === "content_block_start" && payload.content_block?.type === "tool_use") {
          const index = typeof payload.index === "number" ? payload.index : syntheticIndex++;
          toolBuffers.set(index, {
            callId: payload.content_block.id ?? `anthropic-${index}`,
            name: payload.content_block.name ?? "",
            argsBuffer: payload.content_block.input ? JSON.stringify(payload.content_block.input) : "",
          });
          sawToolCall = true;
          yield {
            type: "tool_start",
            callId: payload.content_block.id ?? `anthropic-${index}`,
            name: payload.content_block.name ?? "",
          };
        }

        if (event.event === "content_block_delta") {
          if (payload.delta?.type === "text_delta" && payload.delta.text) {
            yield { type: "text", delta: payload.delta.text };
          } else if (payload.delta?.type === "input_json_delta") {
            if (typeof payload.index !== "number") continue;
            const index = payload.index;
            const existing = toolBuffers.get(index);
            if (existing && payload.delta.partial_json) {
              existing.argsBuffer += payload.delta.partial_json;
              yield { type: "tool_delta", callId: existing.callId, argsDelta: payload.delta.partial_json };
            }
          }
        }

        if (event.event === "content_block_stop") {
          if (typeof payload.index !== "number") continue;
          const index = payload.index;
          const existing = toolBuffers.get(index);
          if (existing) {
            yield {
              type: "tool_call",
              callId: existing.callId,
              name: existing.name,
              args: ensureRecord(safeJsonParse(existing.argsBuffer || "{}")),
            };
            toolBuffers.delete(index);
          }
        }

        if (event.event === "message_delta" && payload.usage) {
          latestUsage = usageFromValue(payload.usage, options);
        }
        if (event.event === "message_delta" && payload.delta?.stop_reason) {
          latestFinishReason = mapFinishReason(payload.delta.stop_reason, sawToolCall || toolBuffers.size > 0);
        }
      }

      if (toolBuffers.size > 0) {
        for (const [, buffer] of toolBuffers) {
          yield {
            type: "tool_call",
            callId: buffer.callId,
            name: buffer.name,
            args: ensureRecord(safeJsonParse(buffer.argsBuffer || "{}")),
          };
        }
      }

      if (latestUsage.total > 0 || latestFinishReason) {
        yield { type: "usage", usage: latestUsage, finishReason: latestFinishReason };
      }
    },
  };
};
