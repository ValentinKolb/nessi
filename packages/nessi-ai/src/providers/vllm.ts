import { openAICompatible } from "./openai-compatible.js";
import type { OpenAICompatibleConfig, Provider } from "../types.js";

export type VLLMOptions = {
  apiKey?: string;
  baseURL?: string;
  contextWindow?: number;
  temperature?: number;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
};

export const vllm = (model: string, options?: VLLMOptions): Provider => {
  const config: OpenAICompatibleConfig = {
    name: "vllm",
    model,
    baseURL: options?.baseURL ?? "http://localhost:8000/v1",
    apiKey: options?.apiKey,
    contextWindow: options?.contextWindow,
    temperature: options?.temperature,
    creditsPerInputToken: options?.creditsPerInputToken,
    creditsPerOutputToken: options?.creditsPerOutputToken,
    compat: {
      toolCallIdPolicy: "passthrough",
      supportsUsageInStreaming: true,
      thinkingFormat: "none",
      maxTokensField: "max_tokens",
    },
  };

  return openAICompatible(config);
};
