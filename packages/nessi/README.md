# @valentinkolb/nessi

Minimal agent loop and provider adapters for TypeScript.

Use the package root for the managed `nessi()` loop with tools, storage, and loop metadata. Use `@valentinkolb/nessi/ai` when an app only needs provider calls through one normalized message and stream API.

## Quick start

```bash
bun add @valentinkolb/nessi
```

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
  loopId: crypto.randomUUID(),
  provider: ollama("llama3.1", {
    baseURL: "http://localhost:11434",
  }),
  systemPrompt: "You are concise.",
  input: "How is the weather in Berlin?",
  store: memoryStore(),
  tools: [weather],
  temperature: 0,
  maxOutputTokens: 512,
});

const textBlocks = new Set<string>();

for await (const event of loop) {
  if (event.type === "block_start" && event.kind === "text") {
    textBlocks.add(event.blockId);
  }
  if (event.type === "block_delta" && textBlocks.has(event.blockId)) {
    process.stdout.write(event.delta);
  }
  if (event.type === "issue") {
    console.error(event.issue.kind, event.issue.message);
  }
  if (event.type === "loop_end") {
    console.log(event.loopId);
    console.log(event.aggregate.usage);
    console.log(event.aggregate.timing);
  }
}
```

Every outbound event from one `nessi()` run carries the same `loopId`. Pass your own `loopId` to align events with a persisted request or UI response group, or let Nessi generate one when omitted.

`turn_end` reports each internal provider turn. The final `loop_end` event includes `aggregate`, which groups assistant turns, executable tool calls, tool results, validation/execution errors, malformed or cancelled tool streams, summed usage, and timing for the complete logical loop. `aggregate.timing.totalElapsedMs` is model generation plus active tool execution; approval/client-tool waits are tracked separately as `aggregate.timing.actionWaitMs`. Helper exports such as `mergeUsage()`, `cloneLoopAggregate()`, and `mergeLoopAggregates()` are available from `@valentinkolb/nessi`.

## Steering

Use `loop.steer()` when the process handling new input owns the running loop:

```ts
loop.steer("Skip deployment and only prepare the migration.");
```

For loops running in another worker or process, provide a `steering` callback
that reads pending messages from application-owned persistence:

```ts
const loop = nessi({
  provider,
  systemPrompt,
  store,
  input,
  tools,
  steering: ({ loopId, signal }) => steeringQueue.takePending(loopId, { signal }),
});
```

The callback may return one message, an ordered array, or `undefined`. Nessi
checks it before provider calls and before a normal loop completion. Applied
messages are persisted as user messages and emit the same `steer_applied`
event as `loop.steer()`. The application owns persistence, claiming, and
delivery semantics; Nessi only controls when steering can affect the loop.

## Structured output

Use `nessi.structured()` when an app wants a schema-valid typed result instead
of a streamed chat response:

```ts
import { nessi } from "@valentinkolb/nessi";
import { openrouter } from "@valentinkolb/nessi/ai";
import { z } from "zod";

const result = await nessi.structured({
  provider: openrouter("openai/gpt-4.1-mini", {
    apiKey: process.env.OPENROUTER_API_KEY,
  }),
  input: "Extract a task card for: Ship the onboarding flow by Friday.",
  outputName: "task_card",
  output: z.object({
    title: z.string(),
    due: z.string().nullable(),
    priority: z.enum(["low", "medium", "high"]),
  }),
  temperature: 0,
});

console.log(result.output.title);
console.log(result.structuredMeta);
console.log(result.aggregate.usage);
```

For providers and schemas that are safe for native structured output, Nessi
passes a provider-specific `responseFormat`. Otherwise it falls back to schema
instructions and one repair attempt. `input` can be a string, content parts, or
a full user message, including image file parts when the provider supports
images.

`nessi.structured()` can use server tools for bounded task work. It adds an
internal `submit_result` tool and returns after that tool receives a valid
schema value. Client tools, approval tools, and interactive tool bridges remain
the job of the full `nessi()` loop.

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

Provider streams use the same block events as the root loop:

```ts
const textBlocks = new Set<string>();

for await (const event of provider.stream({ messages })) {
  if (event.type === "block_start" && event.kind === "text") {
    textBlocks.add(event.blockId);
  }
  if (event.type === "block_delta" && textBlocks.has(event.blockId)) {
    process.stdout.write(event.delta);
  }
  if (event.type === "block_end" && event.block.type === "tool_call") {
    console.log("tool call", event.block.name, event.block.args);
  }
  if (event.type === "issue") {
    console.error(event.issue.kind, event.issue.message);
  }
}
```

## Focused provider imports

```ts
import { anthropic } from "@valentinkolb/nessi/ai/providers/anthropic";
import { openai } from "@valentinkolb/nessi/ai/providers/openai";
```

## Features

- Turn-based agent loop with canonical block streaming events
- Stable `loopId` correlation across all events from one agent loop
- `loop_start`, `turn_start`, `turn_end`, and `loop_end.aggregate` for logical response grouping
- Local `loop.steer()` and optional `steering` callbacks for steering at safe loop boundaries
- Loop timing metadata for wall time, generation time, active tool time, action wait time, and output tokens/second
- `nessi.structured()` for typed schema-valid task results
- Server tools and client tools
- Tool approval flow and explicit `tool_action_request` events
- Tool execution start/end events with per-tool `timeoutMs`
- Structured `issue` events for provider errors, timeouts, malformed tool streams, and tool execution failures
- Pluggable session store
- Optional history compaction
- Standalone `compact()` loop with `loop_start`, `compaction_start`, `compaction_end`, `issue`, and `loop_end` events
- Optional token-credit budgeting
- Provider adapters with shared `complete()` and `stream()` APIs
- Native adapters for OpenAI, OpenRouter, vLLM, Ollama, Anthropic, Mistral, and Gemini

## Package layout

```txt
@valentinkolb/nessi
  Agent loop, structured task helper, tools, stores, compaction, shared types

@valentinkolb/nessi/ai
  Provider factories, provider types, complete(), stream(), responseFormat

@valentinkolb/nessi/ai/providers/*
  Focused provider entrypoints
```
