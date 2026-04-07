# nessi-ai Specs

Implementation reference for `packages/nessi-ai`.

Status:
- Research only
- No implementation yet
- KISS-first
- No batch API in v1

## Scope

`nessi-ai` should be a small package that provides:

- a shared provider abstraction for one-shot and streaming generation
- a small set of provider families
- provider presets for concrete vendors
- compatibility flags for wire-level and schema-level quirks
- message normalization between `nessi`'s internal message model and provider payloads

`nessi-ai` should not include:

- agent loops
- tool execution
- storage
- planning
- batch jobs in v1
- a large model registry

## Supported Families

Public presets:

- `openai()`
- `openrouter()`
- `vllm()`
- `ollama()`
- `anthropic()`
- `mistral()`
- `gemini()`

Internal provider families:

- `openai-compatible`
- `ollama`
- `anthropic`
- `mistral`
- `gemini`

Rationale:

- `openai`, `openrouter`, and `vllm` should share one adapter with small compat overrides.
- `anthropic`, `mistral`, `gemini`, and `ollama` should be native adapters.
- OpenAI itself recommends the newer Responses API for greenfield work, but `nessi-ai` should use Chat Completions for the `openai-compatible` family because it matches OpenRouter and vLLM much better.

Source:

- OpenAI Chat Completions: <https://platform.openai.com/docs/api-reference/chat/create-chat-completion>
- OpenAI Responses note: <https://developers.openai.com/resources/>
- OpenRouter Chat Completions: <https://openrouter.ai/docs/api-reference/chat-completion>
- vLLM OpenAI-compatible server: <https://docs.vllm.ai/en/stable/serving/openai_compatible_server.html>
- Ollama chat API: <https://docs.ollama.com/api/chat>
- Anthropic API overview: <https://platform.claude.com/docs/en/api/overview>
- Anthropic Messages API examples: <https://docs.anthropic.com/en/api/messages-examples>
- Mistral API: <https://docs.mistral.ai/api/>
- Mistral function calling: <https://docs.mistral.ai/capabilities/function_calling/>
- Gemini API overview: <https://ai.google.dev/docs/gemini_api_overview>

## Proposed Public Surface

```ts
export type ProviderFamily =
  | "openai-compatible"
  | "ollama"
  | "anthropic"
  | "mistral"
  | "gemini";

export interface ProviderCapabilities {
  streaming: boolean;
  tools: boolean;
  images: boolean;
  thinking: boolean;
  usage: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface GenerateRequest {
  systemPrompt?: string;
  messages: Message[];
  tools?: ToolSpec[];
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateResult {
  message: AssistantMessage;
  usage?: Usage;
  finishReason: "stop" | "tool_use" | "max_tokens" | "error" | "aborted";
  providerMeta?: {
    requestId?: string;
    model?: string;
    raw?: unknown;
  };
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool_start"; callId: string; name: string }
  | { type: "tool_delta"; callId: string; argsDelta: string }
  | { type: "tool_call"; callId: string; name: string; args: Record<string, unknown> }
  | { type: "usage"; usage: Usage }
  | { type: "error"; error: string; retryable: boolean; contextOverflow?: boolean };

export interface Provider {
  name: string;
  family: ProviderFamily;
  model: string;
  contextWindow?: number;
  capabilities: ProviderCapabilities;
  stream(request: GenerateRequest): AsyncIterable<StreamEvent>;
  complete(request: GenerateRequest): Promise<GenerateResult>;
}
```

Notes:

- `complete()` should be part of the public interface.
- `completeFromStream()` should exist as an internal fallback, not as the primary path.
- For background jobs, scheduled summaries, and structured one-shot tasks, native `complete()` should be preferred wherever the provider supports it.

## Shared Internal Concepts

### Message Model

The package should accept the same core message/content model already used by `nessi-core` if possible.

Needed outbound provider mappings:

- `user` messages
- `assistant` messages
- `tool_result` messages
- multimodal image input where supported
- tool call blocks
- optional thinking blocks

Needed inbound normalization:

- text deltas or full text
- reasoning/thinking deltas or blocks
- streamed or final tool calls
- usage
- stop reason
- retryable vs non-retryable errors

### Common Compat Flags

The initial compat surface should stay small.

```ts
export interface OpenAICompat {
  toolCallIdPolicy?: "passthrough" | "strict9";
  supportsUsageInStreaming?: boolean;
  requiresToolResultName?: boolean;
  requiresAssistantAfterToolResult?: boolean;
  thinkingFormat?: "none" | "reasoning_details" | "text";
  maxTokensField?: "max_tokens" | "max_completion_tokens";
}
```

Initial intent of each flag:

- `toolCallIdPolicy`: handle strict tool call id constraints
- `supportsUsageInStreaming`: emit usage from stream if supported
- `requiresToolResultName`: attach tool name on tool-result messages if required
- `requiresAssistantAfterToolResult`: guard provider-specific sequencing requirements
- `thinkingFormat`: map native reasoning to `thinking` events
- `maxTokensField`: some APIs vary in naming or semantics for output token limits

## Family: openai-compatible

Adapters using this family:

- `openai`
- `openrouter`
- `vllm`

Chosen endpoint:

- `POST /v1/chat/completions`

Why:

- shared wire shape across OpenAI-compatible providers
- tools are already well understood in this format
- easy to support both `stream: false` and `stream: true`
- matches existing `nessi-core` behavior

### Request Shape

Canonical request shape for this family:

```json
{
  "model": "string",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    {
      "role": "assistant",
      "content": "optional text",
      "tool_calls": [
        {
          "id": "call_123",
          "type": "function",
          "function": {
            "name": "search",
            "arguments": "{\"q\":\"hello\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_123",
      "content": "{\"ok\":true}"
    }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search",
        "description": "Search docs",
        "parameters": { "type": "object" }
      }
    }
  ],
  "tool_choice": "auto",
  "stream": false
}
```

Implementation notes:

- user content may be plain text or content parts
- image inputs should map to `image_url` parts when supported
- assistant tool calls must serialize arguments as JSON strings
- tool results should be plain strings when possible, JSON-stringified otherwise

### Non-stream Response Shape

Expected final response structure:

```json
{
  "id": "chatcmpl_...",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "hello",
        "tool_calls": []
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20
  }
}
```

Normalization target:

- text content -> assistant text block
- `tool_calls` -> assistant tool-call blocks
- `finish_reason` -> `GenerateResult.finishReason`
- usage -> `Usage`

### Streaming Shape

Expected transport:

- SSE

Observed common event payload:

```json
{
  "choices": [
    {
      "index": 0,
      "delta": {
        "content": "hel",
        "tool_calls": [
          {
            "index": 0,
            "id": "call_123",
            "function": {
              "name": "search",
              "arguments": "{\"q\":\"he"
            }
          }
        ]
      },
      "finish_reason": null
    }
  ]
}
```

Implementation requirements:

- buffer tool-call args by tool index
- emit `tool_start` when a new streamed tool call appears
- emit `tool_delta` for subsequent argument fragments
- emit final `tool_call` when the provider closes the tool call or the stream ends
- flush any buffered tool calls at stream end even if `finish_reason` is missing
- parse usage chunks when present

### OpenAI Notes

- Official docs expose Chat Completions and also point users toward the newer Responses API for many new integrations.
- Chat Completions supports tools, streaming, and structured output related parameters.
- Streaming usage can be included via `stream_options.include_usage`.

Implementation choice for v1:

- use Chat Completions for the OpenAI-compatible family
- do not add Responses API yet

Source:

- <https://platform.openai.com/docs/api-reference/chat/create-chat-completion>
- <https://platform.openai.com/docs/guides/function-calling>

### OpenRouter Notes

- OpenRouter keeps the OpenAI-like `/chat/completions` surface
- adds OpenRouter-specific fields such as routing `provider`, `models`, and `transforms`
- reasoning-capable models may expose reasoning data separate from plain text

Implementation implications:

- keep OpenRouter under `openai-compatible`
- allow compat override for reasoning stream mapping
- support OpenRouter-only request extensions through a narrowly scoped escape hatch if needed later

Potential future extension:

```ts
extra?: Record<string, unknown>;
```

Source:

- <https://openrouter.ai/docs/api-reference/chat-completion>
- <https://openrouter.ai/docs/api-reference/overview/>

### vLLM Notes

- vLLM exposes an OpenAI-compatible server
- support depends on the served model, server configuration, and chat template
- docs explicitly note extra parameters and supported/unsupported behavior differences

Implementation implications:

- keep vLLM under `openai-compatible`
- expect provider-specific gaps in tools, usage, and multimodal support depending on the backend model
- allow `extra_body` or equivalent extension fields only if truly necessary

Source:

- <https://docs.vllm.ai/en/stable/serving/openai_compatible_server.html>

### Initial Preset Matrix

```ts
openai.compat = {
  toolCallIdPolicy: "passthrough",
  supportsUsageInStreaming: true,
  thinkingFormat: "none",
  maxTokensField: "max_completion_tokens",
};

openrouter.compat = {
  toolCallIdPolicy: "passthrough",
  supportsUsageInStreaming: true,
  thinkingFormat: "reasoning_details",
};

vllm.compat = {
  toolCallIdPolicy: "passthrough",
  supportsUsageInStreaming: false,
  thinkingFormat: "none",
};
```

## Family: ollama

Chosen endpoint:

- `POST /api/chat`

Why:

- stable native API
- can return streamed NDJSON or one-shot JSON
- directly supports local workflows

### Request Shape

```json
{
  "model": "llama3.1",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "hello", "images": ["<base64>"] }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search",
        "description": "Search docs",
        "parameters": { "type": "object" }
      }
    }
  ],
  "stream": false,
  "options": {
    "temperature": 0.2
  }
}
```

### Non-stream Response Shape

```json
{
  "model": "llama3.1",
  "message": {
    "role": "assistant",
    "content": "hello",
    "tool_calls": []
  },
  "done": true,
  "prompt_eval_count": 10,
  "eval_count": 15
}
```

### Streaming Shape

Transport:

- NDJSON

Observed stream shape:

```json
{
  "model": "llama3.1",
  "message": {
    "role": "assistant",
    "content": "he",
    "tool_calls": []
  },
  "done": false
}
```

Implementation notes:

- image input uses `images` on user messages
- tool calls arrive as structured objects, not JSON-stringified args fragments
- final chunk includes token usage fields like `prompt_eval_count` and `eval_count`
- there is no OpenAI-style `tool_call_id` in request history

Source:

- <https://docs.ollama.com/api/chat>
- <https://docs.ollama.com/api/streaming>

## Family: anthropic

Chosen endpoint:

- `POST /v1/messages`

Why:

- primary Anthropic API
- native tool-use and native stream event model
- better fit than forcing Anthropic into OpenAI compatibility

Headers:

- `x-api-key`
- `anthropic-version`
- `content-type: application/json`

### Request Shape

Anthropic separates `system` from `messages`.

Canonical request shape:

```json
{
  "model": "claude-sonnet-4-5",
  "max_tokens": 1024,
  "system": "You are concise.",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What is the weather?" }
      ]
    }
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "Get weather",
      "input_schema": {
        "type": "object",
        "properties": {
          "location": { "type": "string" }
        },
        "required": ["location"]
      }
    }
  ],
  "stream": false
}
```

### Non-stream Response Shape

```json
{
  "id": "msg_...",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Hello" }
  ],
  "model": "claude-opus-4-1-20250805",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 6
  }
}
```

Important Anthropic content block types:

- `text`
- `tool_use`
- `tool_result`
- image/document related blocks in multimodal contexts

### Tool Flow

Anthropic tool use is content-block based.

Expected flow:

- assistant returns a `tool_use` content block with a tool name and structured input
- caller executes the tool
- caller sends a user-side `tool_result` content block back in the next request

Implementation implication:

- Anthropic should not be squeezed into OpenAI assistant/tool message pairs internally
- instead, `nessi-ai` should normalize to/from the common `Message` model at the adapter boundary

### Streaming Shape

Transport:

- SSE

Key event sequence from docs:

- `message_start`
- `content_block_start`
- `content_block_delta`
- `content_block_stop`
- `message_delta`
- `message_stop`

Implementation notes:

- event names matter
- unknown future events should be ignored safely
- fine-grained tool input streaming is supported
- streaming can be used while still building a final message object

Source:

- <https://platform.claude.com/docs/en/api/overview>
- <https://docs.anthropic.com/en/api/messages-examples>
- <https://platform.claude.com/docs/en/build-with-claude/streaming>
- <https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview>
- <https://docs.anthropic.com/en/api/openai-sdk>

## Family: mistral

Chosen endpoint:

- `POST /v1/chat/completions`

Why:

- official chat completion API
- supports tools and structured outputs
- superficially similar to OpenAI, but behavior differences justify a native adapter

### Request Shape

Representative request:

```json
{
  "model": "mistral-large-latest",
  "messages": [
    { "role": "system", "content": "You are concise." },
    { "role": "user", "content": "Find payment status for T1001." }
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "retrieve_payment_status",
        "description": "Get payment status of a transaction",
        "parameters": { "type": "object" }
      }
    }
  ],
  "tool_choice": "auto",
  "parallel_tool_calls": true,
  "stream": false
}
```

### Non-stream Response Shape

Representative tool-call response from docs:

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "",
        "tool_calls": [
          {
            "id": "D681PevKs",
            "type": "function",
            "function": {
              "name": "retrieve_payment_status",
              "arguments": "{\"transaction_id\":\"T1001\"}"
            }
          }
        ]
      }
    }
  ]
}
```

Follow-up tool result shape from docs:

```json
{
  "role": "tool",
  "name": "retrieve_payment_status",
  "content": "{\"status\":\"Paid\"}",
  "tool_call_id": "D681PevKs"
}
```

### Differences That Matter

- tool-call ids may be shorter/stricter than OpenAI ids
- docs expose `parallel_tool_calls`
- `tool_choice` semantics should be treated as native, not assumed from OpenAI behavior
- JSON mode exists through `response_format: { "type": "json_object" }`

Implementation note:

- even though the wire format looks OpenAI-like, Mistral should remain a native family because it is a recurring source of subtle incompatibilities

Source:

- <https://docs.mistral.ai/api/>
- <https://docs.mistral.ai/capabilities/completion/usage>
- <https://docs.mistral.ai/capabilities/function_calling/>
- <https://docs.mistral.ai/capabilities/structured_output/json_mode>

## Family: gemini

Chosen endpoints:

- `POST ...:generateContent`
- `POST ...:streamGenerateContent`

Why:

- Gemini has a clearly native API shape
- tool calling, multimodal input, and structured generation are all first-class
- keeping Gemini native is cleaner than going through compatibility layers

### Request Shape

Gemini works with `contents`, `parts`, `tools`, and `generationConfig`.

Representative request:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "What is the weather in Berlin?" }
      ]
    }
  ],
  "tools": [
    {
      "functionDeclarations": [
        {
          "name": "get_weather",
          "description": "Get weather",
          "parameters": {
            "type": "OBJECT",
            "properties": {
              "location": { "type": "STRING" }
            },
            "required": ["location"]
          }
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.2
  }
}
```

### Non-stream Response Shape

Gemini returns candidates composed of parts.

Representative response concepts:

- `candidates`
- `content.parts`
- `usageMetadata`
- parts may contain `text`, `functionCall`, or `functionResponse`

### Tool Flow

Gemini tool use is part-based:

- model emits `functionCall`
- caller executes the function
- caller returns `functionResponse` in a later request

Implementation note:

- Gemini should normalize function-call parts into `tool_call` blocks
- function-response parts should map to `tool_result` messages at the adapter boundary

### Streaming Shape

Gemini has a separate streaming endpoint rather than an OpenAI-style `stream: true` flag.

Implementation implications:

- stream and complete will use different endpoints
- adapter should keep conversion logic shared above the transport layer

Source:

- <https://ai.google.dev/docs/gemini_api_overview>
- <https://ai.google.dev/gemini-api/docs/text-generation>
- <https://ai.google.dev/gemini-api/docs/function-calling>
- <https://ai.google.dev/gemini-api/docs/structured-output>

## Cross-family Mapping Rules

These rules should be treated as package invariants.

### Input Mapping

- `systemPrompt` stays separate where the native API supports a dedicated system field
- otherwise it is injected as the first system/developer message
- `Message.role === "tool_result"` should never leak directly to providers that use a different native mechanism
- image files should only be forwarded to providers that support them

### Output Mapping

- one normalized assistant message per `complete()`
- one normalized stream of `StreamEvent` per `stream()`
- tool calls must always end as structured `tool_call` events with parsed arguments
- if provider-native arguments are malformed JSON, preserve an error path instead of silently discarding

### Error Mapping

Normalize to:

```ts
{
  type: "error",
  error: string,
  retryable: boolean,
  contextOverflow?: boolean
}
```

Additional internal metadata worth preserving:

- http status
- provider error code
- request id
- retry-after
- raw body

### Streaming Robustness Rules

All adapters should follow these rules:

- flush buffered tool calls on stream end
- tolerate unknown SSE event types
- parse partial chunks defensively
- keep raw-transport parsers small and separately testable
- avoid silent data loss when usage or tool args are malformed

## Implementation Layout Proposal

```txt
packages/nessi-ai/
  package.json
  tsconfig.json
  specs.md
  src/
    index.ts
    types.ts
    complete-from-stream.ts
    shared/
      errors.ts
      tools.ts
      messages.ts
      usage.ts
    providers/
      openai-compatible.ts
      openai.ts
      openrouter.ts
      vllm.ts
      ollama.ts
      anthropic.ts
      mistral.ts
      gemini.ts
```

## Immediate Decisions For v1

- Support only generation, not batches
- Require `complete()` and `stream()` on the public provider interface
- Implement `openai`, `openrouter`, and `vllm` on top of one shared OpenAI-compatible adapter
- Keep `anthropic`, `mistral`, `gemini`, and `ollama` native
- Keep compat flags small and explicit
- Prefer native non-stream `complete()` where available

## Open Questions

- whether to expose an `extra` request field in v1 for provider-specific fields
- whether Gemini structured output should be normalized into the same exact API as OpenAI/Mistral JSON mode
- whether Anthropic tool streaming should surface partial tool input as `tool_delta` or only final parsed args
- whether OpenAI Responses API should be added later as a separate family
