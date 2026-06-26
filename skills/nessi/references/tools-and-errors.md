# Tools and Errors

`@valentinkolb/nessi/ai` normalizes tool-call data, but it does not execute tools. The application owns the tool registry, validation, execution, and follow-up call.

Use `@valentinkolb/nessi` if the user wants a ready-made agent loop with tool execution, approvals, store handling, and compaction.

## Define tool specs

Tool specs are provider-facing JSON schemas:

```ts
const tools = [
  {
    name: "search_docs",
    description: "Search internal docs for a query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];
```

## One-shot tool-call flow

```ts
import type { Message } from "@valentinkolb/nessi/ai";

const messages: Message[] = [
  {
    role: "user" as const,
    content: [{ type: "text" as const, text: "Find the docs for streaming." }],
  },
];

const first = await provider.complete({ messages, tools });

const toolCalls = first.message.content.filter((block) => block.type === "tool_call");

if (toolCalls.length > 0) {
  messages.push(first.message);
}

for (const call of toolCalls) {
  const result = await searchDocs(call.args);
  messages.push({
    role: "tool_result" as const,
    callId: call.id,
    name: call.name,
    result,
  });
}

const final = await provider.complete({ messages, tools });
```

If there can be multiple tool calls, append the assistant message once, then append all matching tool results.

## Streaming tool-call flow

During streaming, collect final `tool_call` events. Use `tool_delta` only for live UI display or debugging; execute tools from the final structured event.

```ts
const toolCalls = [];

for await (const event of provider.stream({ messages, tools })) {
  if (event.type === "tool_call") {
    toolCalls.push(event);
  }
}
```

## Error handling

Stream errors are normalized events:

```ts
for await (const event of provider.stream({ messages })) {
  if (event.type === "error") {
    if (event.contextOverflow) {
      // Summarize, truncate, or ask the user to reduce input.
    }
    if (event.retryable) {
      // Apply bounded retry with backoff in application code.
    }
    throw new Error(event.error);
  }
}
```

`complete()` throws on connection errors, non-OK HTTP responses, and invalid provider JSON.

## Context overflow

Context overflow can appear as:

- `event.type === "error"` with `contextOverflow: true` in streaming
- a thrown error from `complete()`

Recommended application behavior:

1. Keep recent user-visible messages.
2. Drop or summarize large tool results.
3. Retry once after reducing context.
4. If the app needs automatic compaction, use `@valentinkolb/nessi`.

## Browser safety

Do not call hosted providers directly from browser code with secret API keys. Put `@valentinkolb/nessi/ai` behind a backend route:

```ts
// server route
const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

The browser can receive text chunks or server-sent events from your own backend without seeing provider credentials.
