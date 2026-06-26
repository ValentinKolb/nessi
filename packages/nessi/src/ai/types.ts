export type InputFilePart = { type: "file"; data: string; mediaType: string };
export type ContentPart = string | { type: "text"; text: string } | InputFilePart;

export type TextBlock = {
  type: "text";
  text: string;
};

export type ThinkingBlock = {
  type: "thinking";
  thinking: string;
};

export type ToolCallBlock = {
  type: "tool_call";
  id: string;
  name: string;
  args: Record<string, unknown>;
};

export type AssistantContentBlock = TextBlock | ThinkingBlock | ToolCallBlock;

export type UserMessage = {
  role: "user";
  content: ContentPart[];
};

export type AssistantStopReason = "stop" | "tool_use" | "max_tokens" | "aborted" | "interrupted" | "error";

export type AssistantMessage = {
  role: "assistant";
  content: AssistantContentBlock[];
  model?: string;
  usage?: Usage;
  stopReason?: AssistantStopReason;
};

export type ToolResultMessage = {
  role: "tool_result";
  callId: string;
  name: string;
  result: unknown;
  isError?: boolean;
};

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export type Usage = {
  input: number;
  output: number;
  cacheRead?: number;
  total: number;
  creditsUsed?: number;
};

export type ToolSpec = {
  name: string;
  description: string;
  inputSchema: unknown;
};

export type ProviderFamily =
  | "openai-compatible"
  | "ollama"
  | "anthropic"
  | "mistral"
  | "gemini";

export type ProviderCapabilities = {
  streaming: boolean;
  tools: boolean;
  images: boolean;
  thinking: boolean;
  usage: boolean;
};

export type GenerateRequest = {
  systemPrompt?: string;
  messages: Message[];
  tools?: ToolSpec[];
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Ask the provider to skip (or minimize) internal reasoning for this call.
   * Useful for simple generative tasks where reasoning tokens would otherwise
   * consume the entire output budget. Provider-specific mapping:
   * - openai-compatible: sets `reasoning_effort: "low"`
   * - gemini: sets `thinkingConfig.thinkingBudget: 0`
   * - anthropic/mistral/ollama/vllm: no-op (reasoning is opt-in or absent)
   */
  disableReasoning?: boolean;
};

export type GenerateResult = {
  message: AssistantMessage;
  usage?: Usage;
  finishReason: AssistantStopReason;
  providerMeta?: {
    requestId?: string;
    model?: string;
  };
};

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; callId: string; name: string }
  | { type: "tool_delta"; callId: string; argsDelta: string }
  | { type: "tool_call"; callId: string; name: string; args: Record<string, unknown> }
  | { type: "usage"; usage: Usage; finishReason?: AssistantStopReason }
  | { type: "error"; error: string; retryable: boolean; contextOverflow?: boolean; overflowRatio?: number };

export type Provider = {
  name: string;
  family: ProviderFamily;
  model: string;
  contextWindow?: number;
  capabilities: ProviderCapabilities;
  stream(request: GenerateRequest): AsyncIterable<StreamEvent>;
  complete(request: GenerateRequest): Promise<GenerateResult>;
};

export type OpenAICompat = {
  toolCallIdPolicy?: "passthrough" | "strict9";
  supportsUsageInStreaming?: boolean;
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  thinkingFormat?: "none" | "reasoning_details" | "text";
  maxTokensField?: "max_tokens" | "max_completion_tokens";
};

export type OpenAICompatibleConfig = {
  name: string;
  model: string;
  baseURL: string;
  apiKey?: string;
  contextWindow?: number;
  compat?: OpenAICompat;
  temperature?: number;
  creditsPerInputToken?: number;
  creditsPerOutputToken?: number;
  headers?: Record<string, string>;
};
