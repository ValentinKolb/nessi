# nessi-ai Quickstart

`nessi-ai` is a small provider adapter library. It gives applications a common `Provider` interface with:

- `complete(request)` for one-shot generation
- `stream(request)` for streaming generation

It does not run an agent loop, persist messages, or execute tools. Use `nessi-core` when those behaviors are required.

## Install and import

In this repo, `nessi-ai` is a workspace package. In a consuming project, install it however the package is published or linked for that project.

```ts
import { openrouter } from "nessi-ai";
```

Provider constructors use this shape:

```ts
const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

## One-shot completion

```ts
import { openrouter } from "nessi-ai";

const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
  temperature: 0.2,
});

const result = await provider.complete({
  systemPrompt: "You write compact technical summaries.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Explain what SSE is in one paragraph." }],
    },
  ],
  maxOutputTokens: 300,
});

const text = result.message.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");

console.log(text);
console.log(result.usage);
```

## Streaming text

```ts
import { ollama } from "nessi-ai";

const provider = ollama("llama3.1", {
  baseURL: "http://localhost:11434",
  temperature: 0,
});

const messages = [
  {
    role: "user" as const,
    content: [{ type: "text" as const, text: "Write a haiku about Bun." }],
  },
];

for await (const event of provider.stream({ messages })) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.delta);
      break;
    case "usage":
      console.error("\nusage", event.usage);
      break;
    case "error":
      throw new Error(event.error);
  }
}
```

## Minimal provider switcher

```ts
import { ollama, openrouter, type Provider } from "nessi-ai";

function createProvider(name: "local" | "hosted"): Provider {
  if (name === "local") {
    return ollama("llama3.1", { baseURL: "http://localhost:11434" });
  }

  return openrouter("openai/gpt-4.1-mini", {
    apiKey: process.env.OPENROUTER_API_KEY,
  });
}
```

## Common mistakes

- Do not call provider constructors with an object containing `model`; use `(model, options?)`.
- Do not put hosted provider API keys in browser code.
- Do not expect `nessi-ai` to execute tools; it emits normalized tool-call data.
- Do not assume every provider supports every content type, tool behavior, or thinking event.
