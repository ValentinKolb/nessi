import { formatConnectionError, normalizeHttpError } from "../shared/errors.js";
import { assertOnlySupportedFiles, buildAssistantMessage } from "../shared/messages.js";
import { ensureRecord, safeJsonParse } from "../shared/json.js";
import { openSSEStream } from "../shared/stream-helpers.js";
import { toGeminiTools } from "../shared/tools.js";
import { applyCredits, makeUsage } from "../shared/usage.js";
import type { GenerateRequest, GenerateResult, Message, Provider, StreamEvent, ToolCallBlock } from "../types.js";

type GeminiPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
};

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

type GeminiResponse = {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
};

export type GeminiOptions = {
  apiKey?: string;
  baseURL?: string;
  contextWindow?: number;
  temperature?: number;
  maxOutputTokens?: number;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
};

const convertMessages = (messages: Message[]) => {
  const out: GeminiContent[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      assertOnlySupportedFiles(message.content, true, "gemini");
      out.push({
        role: "user",
        parts: message.content.map((part) => {
          if (typeof part === "string") return { text: part };
          if (part.type === "text") return { text: part.text };
          return { inlineData: { mimeType: part.mediaType, data: part.data } };
        }),
      });
      continue;
    }

    if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      for (const block of message.content) {
        if (block.type === "text") parts.push({ text: block.text });
        else if (block.type === "thinking") parts.push({ text: block.thinking });
        else if (block.type === "tool_call") {
          parts.push({ functionCall: { name: block.name, args: block.args } });
        }
      }
      out.push({ role: "model", parts });
      continue;
    }

    out.push({
      role: "user",
      parts: [{
        functionResponse: {
          name: message.name,
          response: ensureRecord(message.result),
        },
      }],
    });
  }
  return out;
};

const usageFromResponse = (response: GeminiResponse, options?: GeminiOptions) =>
  applyCredits(
    makeUsage(
      response.usageMetadata?.promptTokenCount ?? 0,
      response.usageMetadata?.candidatesTokenCount ?? 0,
    ),
    options?.creditsPerInputToken,
    options?.creditsPerOutputToken,
  );

const mapFinishReason = (reason: string | undefined, hasTools: boolean) => {
  if (reason === "MAX_TOKENS") return "max_tokens" as const;
  if (hasTools) return "tool_use" as const;
  return "stop" as const;
};

const createRequestId = () =>
  globalThis.crypto?.randomUUID?.() ?? `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const gemini = (model: string, options?: GeminiOptions): Provider => {
  const baseURL = (options?.baseURL ?? "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/+$/, "");
  const apiKey = options?.apiKey ?? globalThis.process?.env?.GEMINI_API_KEY ?? globalThis.process?.env?.GOOGLE_API_KEY;

  const urlFor = (path: "generateContent" | "streamGenerateContent") => {
    const key = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";
    const alt = path === "streamGenerateContent" ? `${key ? "&" : "?"}alt=sse` : "";
    return `${baseURL}/${model}:${path}${key}${alt}`;
  };

  const buildBody = (request: GenerateRequest) => {
    const body: Record<string, unknown> = {
      contents: convertMessages(request.messages),
    };
    if (request.systemPrompt) {
      body.systemInstruction = { parts: [{ text: request.systemPrompt }] };
    }
    if (request.tools?.length) body.tools = toGeminiTools(request.tools);
    const generationConfig: Record<string, unknown> = {};
    const temperature = request.temperature ?? options?.temperature;
    if (temperature !== undefined) generationConfig.temperature = temperature;
    const maxOutputTokens = request.maxOutputTokens ?? options?.maxOutputTokens;
    if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
    if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
    return body;
  };

  return {
    name: "gemini",
    family: "gemini",
    model,
    contextWindow: options?.contextWindow ?? 1_000_000,
    capabilities: {
      streaming: true,
      tools: true,
      images: true,
      thinking: false,
      usage: true,
    },

    async complete(request: GenerateRequest): Promise<GenerateResult> {
      const requestId = createRequestId();
      const response = await fetch(urlFor("generateContent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(request)),
        signal: request.signal,
      }).catch((error: unknown) => {
        throw new Error(formatConnectionError("gemini", error));
      });

      if (!response.ok) {
        const normalized = await normalizeHttpError("gemini", response);
        throw new Error(normalized.error);
      }

      const payload = safeJsonParse<GeminiResponse>(await response.text());
      if (!payload) throw new Error("gemini returned invalid JSON.");
      const candidate = payload.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];
      const text = parts.map((part) => part.text ?? "").join("");
      const toolCalls: ToolCallBlock[] = parts
        .filter((part): part is GeminiPart & { functionCall: { name: string; args?: Record<string, unknown> } } => Boolean(part.functionCall))
        .map((part, index) => ({
          type: "tool_call",
          id: `${requestId}-${index}`,
          name: part.functionCall!.name,
          args: part.functionCall!.args ?? {},
        }));
      const usage = usageFromResponse(payload, options);
      const finishReason = mapFinishReason(candidate?.finishReason, toolCalls.length > 0);

      return {
        message: buildAssistantMessage(model, text, "", toolCalls, usage, finishReason),
        usage,
        finishReason,
        providerMeta: { model },
      };
    },

    async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
      const result = await openSSEStream(
        urlFor("streamGenerateContent"),
        { "Content-Type": "application/json" },
        buildBody(request),
        "gemini",
        request.signal,
      );

      if (!result.ok) {
        yield result.error;
        return;
      }

      let toolCounter = 0;
      const requestId = createRequestId();
      let latestUsage: ReturnType<typeof usageFromResponse> | undefined;
      let latestFinishReason: GenerateResult["finishReason"] | undefined;
      for await (const event of result.events) {
        if (event.data === "[DONE]") break;
        const payload = safeJsonParse<GeminiResponse>(event.data);
        if (!payload) continue;
        const candidate = payload.candidates?.[0];
        const parts = candidate?.content?.parts ?? [];
        latestFinishReason = mapFinishReason(candidate?.finishReason, parts.some((part) => Boolean(part.functionCall)));
        for (const part of parts) {
          if (part.text) yield { type: "text", delta: part.text };
          if (part.functionCall) {
            const callId = `${requestId}-${toolCounter++}`;
            yield { type: "tool_start", callId, name: part.functionCall.name };
            yield {
              type: "tool_call",
              callId,
              name: part.functionCall.name,
              args: part.functionCall.args ?? {},
            };
          }
        }
        const usage = usageFromResponse(payload, options);
        latestUsage = usage;
        if (usage.total > 0) yield { type: "usage", usage };
      }
      if (latestFinishReason) {
        yield {
          type: "usage",
          usage: latestUsage ?? makeUsage(),
          finishReason: latestFinishReason,
        };
      }
    },
  };
};
