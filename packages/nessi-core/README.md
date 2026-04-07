# nessi-core

Minimal event-driven agent loop for `nessi`.

`nessi-core` is the runtime that drives a conversation turn: call the provider, stream deltas, execute tools, persist messages, and stop when the model stops asking for more work.

## Features

- Turn-based agent loop with streaming events
- Server tools and client tools
- Tool approval flow
- Pluggable session store
- Optional history compaction
- Optional token-credit budgeting
- Provider-agnostic surface powered by `nessi-ai`

## Quick Start

```ts
import { nessi, defineTool, memoryStore } from "nessi-core";
import { ollama } from "nessi-ai";
import { z } from "zod";

const weather = defineTool({
  name: "weather",
  description: "Return a fake weather response",
  inputSchema: z.object({ city: z.string() }),
}).server(async ({ city }) => {
  return { city, forecast: "sunny" };
});

const loop = nessi({
  provider: ollama({
    baseURL: "http://localhost:11434",
    model: "llama3.1",
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

## Tool Model

`nessi-core` distinguishes between two tool kinds:

- Server tools run inside the agent host
- Client tools are fulfilled by the consumer, for example a browser UI

```ts
const confirm = defineTool({
  name: "confirm",
  description: "Ask the user for confirmation",
  inputSchema: z.object({ message: z.string() }),
  outputSchema: z.object({ approved: z.boolean() }),
}).client(() => ({ approved: true }));
```

Client-tool and approval responses go back into the loop via `loop.push(...)`.

## Events

The loop is event-first. Typical outbound events include:

- `turn_start`
- `text`
- `thinking`
- `tool_start`
- `tool_call`
- `tool_end`
- `action_request`
- `turn_end`
- `error`
- `done`

This makes it straightforward to drive a terminal UI, browser UI, or service process from the same runtime.

## Compaction

Compaction is optional. If a conversation gets too large, a custom `compact(ctx)` function can summarize older entries and append a summary checkpoint to the store.

```ts
const loop = nessi({
  provider,
  systemPrompt,
  store,
  input,
  compact: async (ctx) => {
    if (!ctx.force && !ctx.usage) return null;
    const summary = "Summarized earlier turns...";
    await ctx.store.append(
      { role: "assistant", content: [{ type: "text", text: summary }] },
      { kind: "summary" },
    );
  },
});
```

On a provider context-overflow signal, `nessi-core` retries once with forced compaction.

## Project Structure

```txt
src/
  index.ts
  nessi.ts
  compact.ts
  tools.ts
  stores.ts
  types.ts
  providers/
    openai.ts
    openrouter.ts
    ollama.ts
tests/
```

The provider files in `src/providers/` are compatibility re-exports. The actual provider implementations live in `nessi-ai`.
