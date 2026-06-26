# @valentinkolb/nessi

Minimal agent loop and provider adapters for TypeScript.

`@valentinkolb/nessi` exposes the agent runtime at the package root and the provider layer under `@valentinkolb/nessi/ai`.

## Installation

```bash
bun add @valentinkolb/nessi
```

## Agent loop

```ts
import { nessi, defineTool, memoryStore } from "@valentinkolb/nessi";
import { ollama } from "@valentinkolb/nessi/ai";
import { z } from "zod";

const weather = defineTool({
  name: "weather",
  description: "Return a fake weather response",
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => {
  return { city, forecast: "sunny" };
});

const loop = nessi({
  provider: ollama("llama3.1", {
    baseURL: "http://localhost:11434",
  }),
  systemPrompt: "You are concise.",
  input: "How is the weather in Berlin?",
  store: memoryStore(),
  tools: [weather],
});

for await (const event of loop) {
  if (event.type === "text") process.stdout.write(event.delta);
}
```

## Provider-only usage

```ts
import { openrouter } from "@valentinkolb/nessi/ai";

const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
});

const result = await provider.complete({
  systemPrompt: "Be concise.",
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Summarize this package." }],
    },
  ],
});

console.log(result.message.content);
```

## Focused provider imports

```ts
import { anthropic } from "@valentinkolb/nessi/ai/providers/anthropic";
import { openai } from "@valentinkolb/nessi/ai/providers/openai";
```

## Features

- Turn-based agent loop with streaming events
- Server tools and client tools
- Tool approval flow
- Pluggable session store
- Optional history compaction
- Optional token-credit budgeting
- Provider adapters with shared `complete()` and `stream()` APIs
- Native adapters for OpenAI, OpenRouter, vLLM, Ollama, Anthropic, Mistral, and Gemini

## Package layout

```txt
@valentinkolb/nessi
  Agent loop, tools, stores, compaction, shared types

@valentinkolb/nessi/ai
  Provider factories, provider types, complete(), stream()

@valentinkolb/nessi/ai/providers/*
  Focused provider entrypoints
```
