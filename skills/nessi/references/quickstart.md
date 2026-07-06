# @valentinkolb/nessi Quickstart

`@valentinkolb/nessi` exposes an agent loop at the package root and a provider adapter layer under `@valentinkolb/nessi/ai`.

Use the root package when the app needs a managed agent loop with tools, storage, approvals, or compaction. Use the `/ai` subpath when the app only needs provider calls.

The provider layer gives applications a common `Provider` interface with:

- `complete(request)` for one-shot generation
- `stream(request)` for streaming generation

The provider layer does not run an agent loop, persist messages, or execute tools.

## Install and import

In a consuming project, install the package once:

```bash
bun add @valentinkolb/nessi
```

Import providers from the `/ai` subpath:

```ts
import { openrouter } from "@valentinkolb/nessi/ai";
```

Import agent-loop helpers from the package root:

```ts
import { nessi, defineTool, memoryStore } from "@valentinkolb/nessi";
```

Loop aggregate helpers are also available from the root package:

```ts
import { mergeUsage, cloneLoopAggregate, mergeLoopAggregates } from "@valentinkolb/nessi";
```

Provider constructors use this shape:

```ts
const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

## Agent loop with a tool

```ts
import { nessi, defineTool, memoryStore } from "@valentinkolb/nessi";
import { openrouter } from "@valentinkolb/nessi/ai";
import { z } from "zod";

const searchDocs = defineTool({
  name: "search_docs",
  description: "Search internal documentation.",
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }) => {
  return { results: [`Result for ${query}`] };
});

const loop = nessi({
  loopId: crypto.randomUUID(),
  provider: openrouter("openai/gpt-4.1-mini", {
    apiKey: process.env.OPENROUTER_API_KEY,
  }),
  systemPrompt: "Answer from the available tools when useful.",
  input: "Find the docs for streaming events.",
  store: memoryStore(),
  tools: [searchDocs],
  temperature: 0,
  maxOutputTokens: 512,
});

for await (const event of loop) {
  if (event.type === "text") process.stdout.write(event.delta);
  if (event.type === "error") throw new Error(event.error);
  if (event.type === "done") {
    console.error("loop id", event.loopId);
    console.error("finish", event.reason);
    console.error("loop usage", event.aggregate?.usage);
  }
}
```

Every outbound event from one root `nessi()` run carries the same `loopId`.
Pass an application request or response-group id when you have one, or use the
generated `event.loopId` if omitted.

`turn_end` is emitted for each internal provider turn. A single user request
with tools can have multiple internal turns. Use the final `done.aggregate`
for one logical response group, aggregate usage, assistant-turn count,
tool-call count, and tool-error count:

```ts
if (event.type === "done") {
  const aggregate = event.aggregate;
  console.log(aggregate?.assistantMessageCount);
  console.log(aggregate?.toolCallCount, aggregate?.toolErrorCount);
  console.log(aggregate?.toolMalformedCount, aggregate?.toolCancelledCount);
  console.log(aggregate?.toolIssues);
  console.log(aggregate?.usage);
}
```

If your app persists chat UI state, persist the `done.aggregate` payload with
`event.loopId` on your response group. Nessi owns the generic loop semantics;
your app still owns database IDs and storage schema.

## One-shot completion

```ts
import { openrouter } from "@valentinkolb/nessi/ai";

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
import { ollama } from "@valentinkolb/nessi/ai";

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
import { ollama, openrouter, type Provider } from "@valentinkolb/nessi/ai";

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
- Do not expect `@valentinkolb/nessi/ai` to execute tools; it emits normalized tool-call data.
- Do not assume every provider supports every content type, tool behavior, or thinking event.
