import { formatConnectionError, normalizeHttpError } from "../shared/errors.js";
import { assertOnlySupportedFiles, buildAssistantMessage } from "../shared/messages.js";
import { parseNDJSON } from "../shared/ndjson.js";
import { ensureRecord, safeJsonParse, stringifyJson } from "../shared/json.js";
import { toOllamaTools } from "../shared/tools.js";
import { applyCredits, makeUsage } from "../shared/usage.js";
import type { GenerateRequest, GenerateResult, Message, Provider, StreamEvent, ToolCallBlock } from "../types.js";

type OllamaMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  images?: string[];
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
};

type OllamaResponse = {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  };
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
};

export type OllamaOptions = {
  baseURL?: string;
  contextWindow?: number;
  temperature?: number;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
};

const convertMessages = (messages: Message[], systemPrompt: string | undefined) => {
  const out: OllamaMessage[] = [];
  if (systemPrompt) out.push({ role: "system", content: systemPrompt });

  for (const message of messages) {
    if (message.role === "user") {
      assertOnlySupportedFiles(message.content, true, "ollama");
      let text = "";
      const images: string[] = [];
      for (const part of message.content) {
        if (typeof part === "string") text += part;
        else if (part.type === "text") text += part.text;
        else images.push(part.data);
      }
      const next: OllamaMessage = { role: "user", content: text };
      if (images.length > 0) next.images = images;
      out.push(next);
    } else if (message.role === "assistant") {
      let text = "";
      const toolCalls: OllamaMessage["tool_calls"] = [];
      for (const block of message.content) {
        if (block.type === "text") text += block.text;
        else if (block.type === "tool_call") {
          toolCalls.push({ function: { name: block.name, arguments: block.args } });
        }
      }
      const next: OllamaMessage = { role: "assistant", content: text };
      if (toolCalls.length > 0) next.tool_calls = toolCalls;
      out.push(next);
    } else {
      out.push({
        role: "tool",
        name: message.name,
        tool_call_id: message.callId,
        content: stringifyJson({
          tool_call_id: message.callId,
          name: message.name,
          result: message.result,
        }),
      });
    }
  }

  return out;
};

const usageFromResponse = (response: OllamaResponse, options?: OllamaOptions) =>
  applyCredits(
    makeUsage(response.prompt_eval_count ?? 0, response.eval_count ?? 0),
    options?.creditsPerInputToken,
    options?.creditsPerOutputToken,
  );

const toolCallsFromResponse = (response: OllamaResponse): ToolCallBlock[] =>
  (response.message?.tool_calls ?? []).map((toolCall, index) => ({
    type: "tool_call",
    id: `ollama-${index}`,
    name: toolCall.function.name,
    args: toolCall.function.arguments,
  }));

export const ollama = (model: string, options?: OllamaOptions): Provider => {
  const baseURL = (options?.baseURL ?? "http://localhost:11434").replace(/\/+$/, "");
  const contextWindow = options?.contextWindow ?? 128_000;
  const resolveTemperature = (request: GenerateRequest) => request.temperature ?? options?.temperature;

  return {
    name: "ollama",
    family: "ollama",
    model,
    contextWindow,
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
        messages: convertMessages(request.messages, request.systemPrompt),
        stream: false,
      };
      if (request.tools?.length) body.tools = toOllamaTools(request.tools);
      const temperature = resolveTemperature(request);
      if (temperature !== undefined) body.options = { temperature };

      const response = await fetch(`${baseURL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: request.signal,
      }).catch((error: unknown) => {
        throw new Error(formatConnectionError("ollama", error));
      });

      if (!response.ok) {
        const normalized = await normalizeHttpError("ollama", response);
        throw new Error(normalized.error);
      }

      const payload = safeJsonParse<OllamaResponse>(await response.text());
      if (!payload) throw new Error("ollama returned invalid JSON.");
      const usage = usageFromResponse(payload, options);
      const toolCalls = toolCallsFromResponse(payload);
      const finishReason = toolCalls.length > 0 ? "tool_use" : "stop";

      return {
        message: buildAssistantMessage(model, payload.message?.content ?? "", "", toolCalls, usage, finishReason),
        usage,
        finishReason,
        providerMeta: { model },
      };
    },

    async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
      const body: Record<string, unknown> = {
        model,
        messages: convertMessages(request.messages, request.systemPrompt),
        stream: true,
      };
      if (request.tools?.length) body.tools = toOllamaTools(request.tools);
      const temperature = resolveTemperature(request);
      if (temperature !== undefined) body.options = { temperature };

      let response: Response;
      try {
        response = await fetch(`${baseURL}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: request.signal,
        });
      } catch (error) {
        yield {
          type: "error",
          error: formatConnectionError("ollama", error),
          retryable: true,
        };
        return;
      }

      if (!response.ok) {
        const normalized = await normalizeHttpError("ollama", response);
        yield { type: "error", ...normalized };
        return;
      }

      const reader = response.body?.getReader() as ReadableStreamDefaultReader<Uint8Array> | undefined;
      if (!reader) {
        yield { type: "error", error: "ollama response body missing", retryable: false };
        return;
      }

      let toolCounter = 0;
      for await (const chunk of parseNDJSON<OllamaResponse>(reader)) {
        if (chunk.message?.content) yield { type: "text", delta: chunk.message.content };
        for (const toolCall of chunk.message?.tool_calls ?? []) {
          const callId = `ollama-${toolCounter++}`;
          yield { type: "tool_start", callId, name: toolCall.function.name };
          yield {
            type: "tool_call",
            callId,
            name: toolCall.function.name,
            args: ensureRecord(toolCall.function.arguments),
          };
        }
        if (chunk.done) {
          yield { type: "usage", usage: usageFromResponse(chunk, options) };
        }
      }
    },
  };
};
