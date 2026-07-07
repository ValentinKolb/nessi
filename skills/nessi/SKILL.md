---
name: nessi
description: "Build applications with the @valentinkolb/nessi TypeScript library. Use this skill whenever the user wants to create or modify a CLI, backend endpoint, service, prototype, provider switcher, streaming UI adapter, tool-calling workflow, agent loop, or AI integration using @valentinkolb/nessi. Trigger for questions about @valentinkolb/nessi/ai complete(), stream(), provider setup, OpenAI/OpenRouter/vLLM/Ollama/Anthropic/Mistral/Gemini, message formats, canonical block streaming events, issue events for malformed tool streams, loopId correlation, loop_end.aggregate metadata, loop-level stats, tool execution events, usage accounting, generation options, provider timeouts, API keys, local models, context-overflow handling, or when choosing whether the provider-only /ai layer is enough versus the root agent loop."
---

# @valentinkolb/nessi Consumer Skill

Use this skill to help someone build software on top of `@valentinkolb/nessi`. Keep the focus on the public consumer API. Do not drift into repository-maintainer work unless the user explicitly asks to change nessi itself.

## First move

1. Identify the application shape: CLI, backend route, browser adapter, service job, test fixture, or agent prototype.
2. Identify the provider family: hosted API, OpenRouter aggregation, local Ollama/vLLM, or a custom OpenAI-compatible endpoint.
3. Decide whether the user needs only the provider layer or the full agent loop:
   - Use `@valentinkolb/nessi/ai` for provider calls, streaming, message normalization, tool-call extraction, and usage data.
   - Use the `@valentinkolb/nessi` root exports when the user wants an agent loop that executes tools, stores conversation history, handles approvals, or compacts context.
4. Produce working TypeScript that matches the current public API:
   - Root agent APIs come from `@valentinkolb/nessi`.
   - Provider constructors come from `@valentinkolb/nessi/ai`, take `(model, options?)`, then expose `complete(request)` and `stream(request)`.

## Reference routing

Read only the references needed for the task:

| Need | Read |
| --- | --- |
| Minimal setup, imports, complete() examples | `references/quickstart.md` |
| Choosing and configuring providers | `references/providers.md` |
| Message shapes, files, stream events, usage | `references/messages-and-streaming.md` |
| Tool-call flow, errors, retries, context overflow | `references/tools-and-errors.md` |

## Implementation preferences

- Prefer small examples that can be pasted into a real TypeScript/Bun project.
- Keep provider configuration explicit: model string first, options second.
- Use environment variables for API keys and avoid hardcoding secrets.
- Stream by iterating events and switching on `event.type`.
- For root `nessi()` loops, pass an application-level `loopId` when the app already has a request/response group id; otherwise use the generated `event.loopId` that appears on every outbound event.
- For root `nessi()` loops, pass `temperature`, `maxOutputTokens`, and `disableReasoning` at the top level when the app has a default generation policy for the whole loop.
- For root `nessi()` loops, use `event.type === "loop_end"` plus `event.aggregate` for one logical response group, aggregate usage, loop-level stats, assistant turn count, tool calls, tool results, validation/execution errors, and malformed/cancelled tool-stream issues across multi-turn tool loops.
- For standalone `compact()` loops, use the same `loopId` grouping pattern and handle `loop_start`, `compaction_start`, `compaction_end`, `issue`, and `loop_end`.
- Treat `issue.kind === "malformed_tool_call"` and `issue.kind === "cancelled_tool_call"` as pre-execution stream issues. They mean no executable tool call exists for that pending provider start.
- Treat `tool_execution_start` / `tool_execution_end` as Nessi's tool-runtime attempt boundary. `tool_action_request` is the event that asks the app for approval or client-side tool output.
- Treat tool calls as data the application must handle; `@valentinkolb/nessi/ai` does not execute tools.
- Surface unsupported file input and provider error behavior instead of hiding it.
- If the user asks for browser code, keep API keys server-side and expose a backend route.

## Current public surface

Root agent APIs:

```ts
import { nessi, defineTool, memoryStore } from "@valentinkolb/nessi";
```

Loop aggregate helpers:

```ts
import { mergeUsage, cloneLoopAggregate, mergeLoopAggregates } from "@valentinkolb/nessi";
```

Provider constructors:

```ts
import {
  anthropic,
  gemini,
  mistral,
  ollama,
  openai,
  openAICompatible,
  openrouter,
  vllm,
} from "@valentinkolb/nessi/ai";
```

Focused provider imports are also available:

```ts
import { openrouter } from "@valentinkolb/nessi/ai/providers/openrouter";
```

Common request shape:

```ts
const result = await provider.complete({
  systemPrompt: "Be concise.",
  messages: [
    { role: "user", content: [{ type: "text", text: "Summarize this." }] },
  ],
  temperature: 0,
  maxOutputTokens: 512,
});
```

Common stream shape:

```ts
const textBlocks = new Set<string>();

for await (const event of provider.stream({ messages })) {
  if (event.type === "block_start" && event.kind === "text") textBlocks.add(event.blockId);
  if (event.type === "block_delta" && textBlocks.has(event.blockId)) process.stdout.write(event.delta);
  if (event.type === "issue") console.error(event.issue.kind, event.issue.message);
}
```

Common root-loop handling:

```ts
const loop = nessi({
  loopId: requestId,
  provider,
  systemPrompt,
  input,
  store,
  tools,
  temperature: 0,
  maxOutputTokens: 512,
  disableReasoning: true,
});

const textBlocks = new Set<string>();

for await (const event of loop) {
  if (event.type === "block_start" && event.kind === "text") textBlocks.add(event.blockId);
  if (event.type === "block_delta" && textBlocks.has(event.blockId)) process.stdout.write(event.delta);
  if (event.type === "issue") console.error(event.issue.kind, event.issue.message);
  if (event.type === "loop_end") {
    console.log(event.loopId);
    console.log(event.reason);
    console.log(event.aggregate.usage);
    console.log(event.aggregate.toolErrorCount);
    console.log(event.aggregate.toolMalformedCount);
  }
}
```

## Output style

When answering user requests, include:

1. The shortest viable implementation.
2. Any provider-specific setup or environment variables.
3. How to handle streaming, tool calls, and errors if relevant.
4. One verification step, such as a Bun command or a small mocked test.

Avoid large frameworks unless the user asks for one. If the requested task is ambiguous, state the assumption and pick the simplest useful shape.
