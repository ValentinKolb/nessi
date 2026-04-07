# nessi-ai

Small provider adapter layer for `nessi`.

`nessi-ai` gives `nessi` a single provider surface with native `complete()` and `stream()` support. It stays intentionally small: no model registry, no batch layer, no vendor SDK dependency, and no giant abstraction tree.

## Features

- `complete()` and `stream()` on every provider
- Shared message, usage, and tool-schema types
- Native adapters for `ollama`, `anthropic`, `mistral`, and `gemini`
- Shared OpenAI-compatible adapter for `openai`, `openrouter`, and `vllm`
- Small capability model for `tools`, `images`, `thinking`, `streaming`, and `usage`
- Pure `fetch`-based implementation

## Supported Providers

- `openai()`
- `openrouter()`
- `vllm()`
- `ollama()`
- `anthropic()`
- `mistral()`
- `gemini()`
- `openAICompatible()` for custom OpenAI-style endpoints

## Quick Start

```ts
import { openrouter } from "nessi-ai";

const provider = openrouter({
  model: "openai/gpt-4.1-mini",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

const result = await provider.complete({
  systemPrompt: "Be concise.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Summarize this repository in one sentence." }],
    },
  ],
});

console.log(result.message.content);
```

Streaming works through the same provider instance:

```ts
for await (const event of provider.stream({
  messages: [{ role: "user", content: [{ type: "text", text: "Explain compaction." }] }],
})) {
  if (event.type === "text") process.stdout.write(event.delta);
}
```

## Design Constraints

- Keep the public API small
- Model provider differences explicitly where they matter
- Share logic across OpenAI-compatible backends, but do not pretend they are identical
- Fail clearly on unsupported payloads instead of dropping data silently

## Project Structure

```txt
src/
  index.ts
  types.ts
  complete-from-stream.ts
  shared/
    errors.ts
    json.ts
    messages.ts
    ndjson.ts
    sse.ts
    tools.ts
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
tests/
  unit/
  providers/
  fixtures/
```

## Notes

- `completeFromStream()` exists as a fallback helper, but native `complete()` paths are preferred.
- `specs.md` is the implementation reference for request/response mappings and provider quirks.
- `nessi-core` reuses the same message and provider types from this package.
