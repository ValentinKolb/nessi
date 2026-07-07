# Tools and Errors

`@valentinkolb/nessi/ai` normalizes tool-call data, but it does not execute tools. The application owns the tool registry, validation, execution, and follow-up call.

Use `@valentinkolb/nessi` if the user wants a ready-made agent loop with tool execution, approvals, store handling, and compaction.

For the root `nessi()` agent loop, keep using streaming events for live UI and
debug output:

- `loopId` is present on every outbound event from one logical loop.
- `turn_end` reports each internal provider turn.
- `block_end` with `block.type === "tool_call"` reports final executable provider tool calls.
- `tool_execution_start` / `tool_execution_end` report Nessi's tool execution attempts.
- `tool_action_request` asks the app for approval, client-side tool output, or a custom approval inside a server tool.
- `issue` reports provider errors, timeouts, malformed/cancelled tool streams, and tool execution failures.
- `loop_end.aggregate` reports the complete logical loop after all internal turns.

Use `loop_end.aggregate` when the app needs one user-visible response group,
aggregate usage, loop-level tool counts, persisted tool execution errors, or
malformed/cancelled tool-stream metadata:

```ts
const loop = nessi({
  loopId: responseGroupId,
  provider,
  systemPrompt,
  input,
  store,
  tools,
});

for await (const event of loop) {
  if (event.type === "loop_end") {
    const { aggregate } = event;
    saveResponseGroup({
      loopId: event.loopId,
      reason: event.reason,
      usage: aggregate.usage,
      turns: aggregate.turns,
      issueCount: aggregate.issueCount,
      issues: aggregate.issues,
      toolCallCount: aggregate.toolCallCount,
      toolErrorCount: aggregate.toolErrorCount,
      toolIssueCount: aggregate.toolIssueCount,
      toolMalformedCount: aggregate.toolMalformedCount,
      toolCancelledCount: aggregate.toolCancelledCount,
      toolIssues: aggregate.toolIssues,
    });
  }
}
```

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

During provider-only streaming, collect final `tool_call` content blocks from
`block_end`. If an `issue` appears with `kind` set to `malformed_tool_call` or
`cancelled_tool_call`, the pending provider start never became executable.

```ts
const toolCalls = [];
const toolIssues = [];

for await (const event of provider.stream({ messages, tools })) {
  if (event.type === "block_end" && event.block.type === "tool_call") {
    toolCalls.push(event.block);
  }
  if (
    event.type === "issue"
    && (event.issue.kind === "malformed_tool_call" || event.issue.kind === "cancelled_tool_call")
  ) {
    toolIssues.push(event.issue);
  }
}
```

For root `nessi()` loops, wait for `tool_action_request` before asking the app
to approve an action or execute a client-side tool:

```ts
for await (const event of loop) {
  if (event.type === "tool_action_request" && event.kind === "client_tool") {
    const result = await runClientTool(event.name, event.args);
    loop.push({ type: "tool_result", callId: event.callId, result });
  }
}
```

Top-level client tools validate pushed results against their `outputSchema`.
Nested `ctx.requestClientTool()` calls also validate args and output when the
requested client tool name is registered in `tools`.

## Error handling

Stream problems are normalized `issue` events:

```ts
for await (const event of provider.stream({ messages })) {
  if (event.type === "issue") {
    if (event.issue.kind === "provider_error" && event.issue.contextOverflow) {
      // Summarize, truncate, or ask the user to reduce input.
    }
    if ("retryable" in event.issue && event.issue.retryable) {
      // Apply bounded retry with backoff in application code.
    }
    throw new Error(event.issue.message);
  }
}
```

Malformed tool streams are not provider connection errors. Handle them separately
if the UI wants to show model/tool-call diagnostics:

```ts
if (
  event.type === "issue"
  && (event.issue.kind === "malformed_tool_call" || event.issue.kind === "cancelled_tool_call")
) {
  console.warn(event.issue.reason, event.issue.callId, event.issue.message);
}
```

`complete()` throws on connection errors, non-OK HTTP responses, and invalid provider JSON.

## Context overflow

Context overflow can appear as:

- `event.type === "issue"` with `issue.kind === "provider_error"` and `contextOverflow: true` in streaming
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
