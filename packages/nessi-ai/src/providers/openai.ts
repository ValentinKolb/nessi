import { openAICompatible } from "./openai-compatible.js";
import type { OpenAICompatibleConfig, Provider } from "../types.js";

export interface OpenAIOptions {
  apiKey?: string;
  baseURL?: string;
  contextWindow?: number;
  temperature?: number;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
  normalizeToolCallIds?: "auto" | "never" | "strict9";
}

export function openai(model: string, options?: OpenAIOptions): Provider {
  const config: OpenAICompatibleConfig = {
    name: "openai",
    model,
    baseURL: options?.baseURL ?? "https://api.openai.com/v1",
    apiKey: options?.apiKey ?? globalThis.process?.env?.OPENAI_API_KEY,
    contextWindow: options?.contextWindow,
    temperature: options?.temperature,
    creditsPerInputToken: options?.creditsPerInputToken,
    creditsPerOutputToken: options?.creditsPerOutputToken,
    compat: {
      toolCallIdPolicy: options?.normalizeToolCallIds === "strict9" ? "strict9" : "passthrough",
      supportsUsageInStreaming: true,
      thinkingFormat: "none",
      maxTokensField: "max_completion_tokens",
    },
  };

  return openAICompatible(config);
}
