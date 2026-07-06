# Messages and Streaming

`@valentinkolb/nessi/ai` uses one message model across providers. Adapters translate this model to each provider's native wire format.

## Message model

```ts
type Message = UserMessage | AssistantMessage | ToolResultMessage;
```

User messages contain content parts:

```ts
const userMessage = {
  role: "user" as const,
  content: [
    { type: "text" as const, text: "Describe this image." },
    {
      type: "file" as const,
      mediaType: "image/png",
      data: base64Png,
    },
  ],
};
```

Assistant messages contain normalized blocks:

```ts
const assistantMessage = {
  role: "assistant" as const,
  content: [
    { type: "text" as const, text: "I can help with that." },
    { type: "thinking" as const, thinking: "Reasoning if the provider exposes it." },
    { type: "tool_call" as const, id: "call-1", name: "search", args: { q: "@valentinkolb/nessi/ai" } },
  ],
};
```

Tool result messages return application-computed tool outputs to the next provider call:

```ts
const toolResult = {
  role: "tool_result" as const,
  callId: "call-1",
  name: "search",
  result: { hits: [] },
};
```

## Completion response

`complete()` returns a final assistant message, usage, finish reason, and provider metadata.

```ts
const result = await provider.complete({ messages });

if (result.finishReason === "tool_use") {
  // Inspect result.message.content for tool_call blocks.
}
```

Extract final text:

```ts
const text = result.message.content
  .filter((block) => block.type === "text")
  .map((block) => block.text)
  .join("");
```

## Stream events

Always switch on `event.type`:

```ts
for await (const event of provider.stream({ messages })) {
  switch (event.type) {
    case "text":
      process.stdout.write(event.delta);
      break;
    case "thinking":
      console.error(event.delta);
      break;
    case "tool_start":
      console.error("tool started", event.name, event.callId);
      break;
    case "tool_delta":
      break;
    case "tool_call":
      await handleToolCall(event);
      break;
    case "tool_error":
      console.error("malformed tool stream", event.reason, event.callId);
      break;
    case "tool_cancel":
      console.error("cancelled tool stream", event.reason, event.callId);
      break;
    case "usage":
      console.error("usage", event.usage, event.finishReason);
      break;
    case "error":
      throw new Error(event.error);
  }
}
```

Event meanings:

- `text`: user-visible text delta.
- `thinking`: provider-exposed reasoning delta when available.
- `tool_start`: a streamed tool call has begun. In root `nessi()` loops this is emitted only once the call has validated executable input.
- `tool_delta`: partial tool argument text for providers that stream tool input.
- `tool_call`: final parsed tool call with `callId`, `name`, and structured `args`.
- `tool_error`: malformed pre-execution tool stream, such as text arriving while a tool call is half-open or invalid streamed JSON arguments. Do not execute a tool for this event.
- `tool_cancel`: a pending tool start was cancelled before it became executable, usually because the stream ended or the provider failed.
- `usage`: token usage, sometimes with final `finishReason`.
- `error`: normalized provider or connection error.

## Tool-stream invariants

Apps should execute tools only from final `tool_call` events. Provider adapters
can still expose `tool_start` / `tool_delta` for live diagnostics, but malformed
or cancelled pending starts are closed with `tool_error` or `tool_cancel`.

For root `nessi()` loops, `tool_start` is durable/user-visible only after Nessi
has validated the tool input against the app's tool schema. If a provider emits
plain text while a tool call is half-open, Nessi emits `tool_error`, suppresses
the malformed text from assistant persistence, and reports the issue in
`done.aggregate.toolIssues`.

## Usage accounting

Usage has normalized token counts:

```ts
type Usage = {
  input: number;
  output: number;
  total: number;
  cacheRead?: number;
  creditsUsed?: number;
};
```

If the provider was configured with `creditsPerInputToken` and `creditsPerOutputToken`, `creditsUsed` is attached when usage is available.

## Abort and output budget

Pass an `AbortSignal` to cancel a request:

```ts
const controller = new AbortController();

const result = await provider.complete({
  messages,
  signal: controller.signal,
  maxOutputTokens: 256,
});
```

Use `disableReasoning: true` for simple calls where reasoning-capable models would otherwise spend too much output budget. Root `nessi()` accepts the same generation controls:

```ts
const loop = nessi({
  provider,
  systemPrompt,
  input,
  store,
  temperature: 0,
  maxOutputTokens: 512,
  disableReasoning: true,
});
```
