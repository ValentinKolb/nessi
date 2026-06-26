# Provider Setup

All provider constructors return a `Provider` with the same consumer-facing interface:

```ts
const provider = providerFactory(model, options);
await provider.complete(request);
for await (const event of provider.stream(request)) {}
```

## Hosted OpenAI

```ts
import { openai } from "nessi-ai";

const provider = openai("gpt-4.1-mini", {
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0,
});
```

Useful options:

- `baseURL` for compatible gateways
- `contextWindow` when the app wants overflow heuristics
- `creditsPerInputToken` and `creditsPerOutputToken` for cost accounting
- `normalizeToolCallIds: "strict9"` for providers that need short alphanumeric tool IDs

## OpenRouter

```ts
import { openrouter } from "nessi-ai";

const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
  referer: "https://example.com",
  title: "Example App",
});
```

OpenRouter is a good default when the app needs model routing or easy model swapping. It can emit `thinking` events for reasoning-capable models through normalized stream events.

## vLLM and custom OpenAI-compatible endpoints

```ts
import { vllm, openAICompatible } from "nessi-ai";

const localVllm = vllm("meta-llama/Llama-3.1-8B-Instruct", {
  baseURL: "http://localhost:8000/v1",
});

const custom = openAICompatible({
  name: "internal-gateway",
  model: "company-model",
  baseURL: "https://ai.example.com/v1",
  apiKey: process.env.INTERNAL_AI_KEY,
  compat: {
    supportsUsageInStreaming: true,
    thinkingFormat: "none",
    maxTokensField: "max_tokens",
  },
});
```

Use `openAICompatible` when a gateway follows Chat Completions semantics closely enough but needs explicit compatibility flags.

## Ollama

```ts
import { ollama } from "nessi-ai";

const provider = ollama("llama3.1", {
  baseURL: "http://localhost:11434",
  temperature: 0.2,
});
```

Ollama is useful for local development and offline workflows. It streams NDJSON internally, but consumers still receive normalized `StreamEvent` values.

## Anthropic

```ts
import { anthropic } from "nessi-ai";

const provider = anthropic("claude-sonnet", {
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxOutputTokens: 1024,
});
```

Anthropic uses native content blocks for tool use. Consumers still receive normalized assistant content and `tool_call` stream events.

## Mistral

```ts
import { mistral } from "nessi-ai";

const provider = mistral("mistral-small-latest", {
  apiKey: process.env.MISTRAL_API_KEY,
  normalizeToolCallIds: "strict9",
});
```

Mistral looks OpenAI-like but has enough tool-call differences to use its native adapter. Keep tool-call IDs short if the backend requires it.

## Gemini

```ts
import { gemini } from "nessi-ai";

const provider = gemini("gemini-2.0-flash", {
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY,
  maxOutputTokens: 1024,
});
```

Gemini supports native multimodal input and function calls. `disableReasoning: true` maps to a zero thinking budget.

## Provider selection heuristics

- Choose `ollama` for local-only prototypes.
- Choose `openrouter` for model choice and hosted routing.
- Choose `openai` for direct OpenAI billing and behavior.
- Choose `anthropic`, `gemini`, or `mistral` when the user explicitly wants that vendor's native API behavior.
- Choose `vllm` for local or self-hosted OpenAI-compatible serving.
- Choose `openAICompatible` for a custom gateway where explicit compatibility flags matter.
