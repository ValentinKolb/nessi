import { openAICompatible } from "./openai-compatible.js";
import type { OpenAICompatibleConfig, Provider } from "../types.js";

export interface OpenRouterOptions {
  apiKey?: string;
  baseURL?: string;
  contextWindow?: number;
  temperature?: number;
  referer?: string;
  title?: string;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
}

export function openrouter(model: string, options?: OpenRouterOptions): Provider {
  const headers: Record<string, string> = {};
  if (options?.referer) headers["HTTP-Referer"] = options.referer;
  if (options?.title) headers["X-Title"] = options.title;

  const config: OpenAICompatibleConfig = {
    name: "openrouter",
    model,
    baseURL: options?.baseURL ?? "https://openrouter.ai/api/v1",
    apiKey: options?.apiKey ?? globalThis.process?.env?.OPENROUTER_API_KEY,
    contextWindow: options?.contextWindow,
    temperature: options?.temperature,
    creditsPerInputToken: options?.creditsPerInputToken,
    creditsPerOutputToken: options?.creditsPerOutputToken,
    headers,
    compat: {
      toolCallIdPolicy: "passthrough",
      supportsUsageInStreaming: true,
      thinkingFormat: "reasoning_details",
      maxTokensField: "max_tokens",
    },
  };

  return openAICompatible(config);
}
