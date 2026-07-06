// ============================================================================
// nessi – Core Loop
// ============================================================================

import type {
  NessiOptions,
  NessiLoop,
  OutboundEvent,
  InboundEvent,
  DoneReason,
  Message,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  AssistantContentBlock,
  ToolCallBlock,
  Usage,
  Tool,
  ToolContext,
  ProviderEvent,
  LoopToolCallAggregate,
  LoopToolIssueAggregate,
  LoopTurnAggregate,
} from "./types.js";
import { aggregateFromTurns, cloneUsage } from "./aggregates.js";
import { appendAssistantContentBlock, buildAssistantMessageFromContent } from "./ai/shared/messages.js";
import { normalizeToolStream } from "./ai/shared/tool-stream-normalizer.js";
import { toolToSpec } from "./tools.js";
import { zeroUsage, toErrorMessage, estimateTokens, truncateToolResults } from "./utils.js";

// ----------------------------------------------------------------------------
// Inbound event channel — lets the consumer push() events that the loop awaits
// ----------------------------------------------------------------------------

type Channel<T> = {
  push(value: T): void;
  pull(): Promise<T>;
}

const createChannel = <T>(): Channel<T> => {
  const queue: T[] = [];
  const waiters: Array<(value: T) => void> = [];

  return {
    push(value: T) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter(value);
      } else {
        queue.push(value);
      }
    },
    pull() {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      return new Promise((resolve) => waiters.push(resolve));
    },
  };
}

// ----------------------------------------------------------------------------
// Input normalization
// ----------------------------------------------------------------------------

const normalizeInput = (input: NessiOptions["input"]): UserMessage => {
  if (typeof input === "string") {
    return { role: "user", content: [{ type: "text", text: input }] };
  }
  return {
    role: "user",
    content: input.map((part) => (typeof part === "string" ? { type: "text" as const, text: part } : part)),
  };
}

// ----------------------------------------------------------------------------
// Debug helpers
// ----------------------------------------------------------------------------

const formatDebugJson = (value: unknown, maxLength = 2400) => {
  try {
    const text = JSON.stringify(value, null, 2) ?? String(value);
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n... truncated`;
  } catch {
    return String(value);
  }
}

const formatToolValidationError = (tool: Tool, args: unknown, error: { issues: unknown[] }) => {
  const issues = error.issues.length > 0
    ? error.issues
        .map((rawIssue, index) => {
          const issue = rawIssue as {
            path?: unknown;
            code?: unknown;
            message?: unknown;
            expected?: unknown;
            input?: unknown;
          };
          const path = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "(root)";
          const code = typeof issue.code === "string" ? issue.code : "unknown";
          const message = typeof issue.message === "string" ? issue.message : "Validation failed";
          const expected = typeof issue.expected === "string" ? `, expected ${issue.expected}` : "";
          const received = Object.prototype.hasOwnProperty.call(issue, "input")
            ? `, received ${formatDebugJson(issue.input, 200).replace(/\s+/g, " ")}`
            : "";
          return `${index + 1}. ${path}: ${message} [${code}${expected}${received}]`;
        })
        .join("\n")
    : "No detailed issues reported.";

  return [
    `Validation error for tool "${tool.def.name}"`,
    "",
    "Issues:",
    issues,
    "",
    "Received args:",
    formatDebugJson(args),
    "",
    "Expected input schema:",
    formatDebugJson(toolToSpec(tool).inputSchema),
  ].join("\n");
}

const createLoopId = () =>
  globalThis.crypto?.randomUUID?.() ?? `loop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// ----------------------------------------------------------------------------
// nessi()
// ----------------------------------------------------------------------------

export const nessi = (options: NessiOptions): NessiLoop => {
  const {
    agentId = "main",
    loopId: requestedLoopId,
    input,
    provider,
    systemPrompt,
    tools = [],
    store,
    creditStore,
    compact,
    maxTurns = Infinity,
    temperature,
    maxOutputTokens,
    disableReasoning,
    maxToolResultChars,
    signal: externalSignal,
  } = options;

  const channel = createChannel<InboundEvent>();
  const deferredInbound: InboundEvent[] = [];
  const steerQueue: string[] = [];
  const subscribers: Array<(event: OutboundEvent) => void> = [];
  const abortController = new AbortController();
  /** Events injected synchronously from abort() — drained by iterator.next() before polling the generator. */
  const pendingInjections: OutboundEvent[] = [];
  let interrupted = false;
  let lastUsage: Usage = zeroUsage();
  const loopTurns: LoopTurnAggregate[] = [];
  const loopToolIssues: LoopToolIssueAggregate[] = [];
  const loopId = requestedLoopId?.trim() ? requestedLoopId : createLoopId();
  const snapshotAggregate = () => aggregateFromTurns(loopTurns, loopToolIssues);

  const doneEvent = (reason: DoneReason): Extract<OutboundEvent, { type: "done" }> => ({
    type: "done",
    agentId,
    loopId,
    reason,
    aggregate: snapshotAggregate(),
  });

  const recordAssistantTurn = (
    message: AssistantMessage,
    usage: Usage | undefined,
    toolCalls: LoopToolCallAggregate[],
    toolIssues: LoopToolIssueAggregate[] = [],
  ) => {
    const turn: LoopTurnAggregate = {
      message,
      usage: cloneUsage(usage),
      stopReason: message.stopReason,
      toolCalls,
      ...(toolIssues.length > 0 ? { toolIssues: toolIssues.map((issue) => ({ ...issue })) } : {}),
    };
    loopTurns.push(turn);
  };

  // Pull the inbound event for a specific callId/type, buffering unrelated events.
  const pullMatching = async <T extends InboundEvent>(match: (event: InboundEvent) => event is T): Promise<T> => {
    while (true) {
      const bufferedIdx = deferredInbound.findIndex(match);
      if (bufferedIdx >= 0) {
        return deferredInbound.splice(bufferedIdx, 1)[0] as T;
      }
      const inbound = await channel.pull();
      if (match(inbound)) return inbound;
      deferredInbound.push(inbound);
    }
  }

  // Link external signal
  if (externalSignal) {
    if (externalSignal.aborted) {
      abortController.abort();
    } else {
      externalSignal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }

  const signal = abortController.signal;

  // Tool lookup (fix F: build functionally)
  const names = tools.map(t => t.def.name);
  if (new Set(names).size !== names.length) {
    const dup = names.find((n, i) => names.indexOf(n) !== i);
    throw new Error(`Duplicate tool name: ${dup}`);
  }
  const toolMap = new Map(tools.map(t => [t.def.name, t]));

  // Helper: create and store a tool result message (fix C)
  const appendToolResult = async (callId: string, name: string, result: unknown, isError = false) => {
    const msg: ToolResultMessage = { role: "tool_result", callId, name, result, isError };
    await store.append(msg);
    return msg;
  }

  // The generator that drives the loop
  async function* run(): AsyncGenerator<OutboundEvent> {
    const userMessage = normalizeInput(input);
    let turn = 0;
    let compactionRetried = false;
    try {
      await store.append(userMessage);

      while (turn < maxTurns) {
        if (signal.aborted) {
          yield doneEvent("aborted");
          return;
        }

        // Credit check
        if (creditStore) {
          const remaining = await creditStore.remaining();
          if (remaining <= 0) {
            yield doneEvent("no_credits");
            return;
          }
        }

        // Drain queued steer messages (non-blocking)
        while (steerQueue.length > 0) {
          const text = steerQueue.shift()!;
          const steerMessage: UserMessage = {
            role: "user",
            content: [{ type: "text", text }],
          };
          await store.append(steerMessage);
          turn = 0;
          compactionRetried = false;
          yield { type: "steer_applied", agentId, loopId, message: text };
        }

        // Load entries from store
        let entries = await store.load();

      // Compute fill ratio for compaction decisions.
      // Prefer real provider usage from last turn; fall back to char-based estimate (first turn only).
      const contextWindow = provider.contextWindow;
      const computeFillRatio = (msgs: Message[]) => {
        if (typeof contextWindow !== "number" || contextWindow <= 0) return undefined;
        const tokens = lastUsage.total > 0 ? lastUsage.total : estimateTokens(msgs);
        return tokens / contextWindow;
      };

      // Compaction (before provider call) — skip if we just did a force-retry
      if (compact && !compactionRetried) {
        const fillRatio = computeFillRatio(entries.map((e) => e.message));
        const shouldForce = typeof fillRatio === "number" && fillRatio >= 0.85;
        const compaction = compact({
          entries,
          store,
          provider,
          usage: lastUsage,
          force: shouldForce,
          fillRatio,
        });
        if (compaction) {
          yield { type: "compaction_start", agentId, loopId };
          await compaction;
          yield { type: "compaction_end", agentId, loopId };
          entries = await store.load();
        }
      }

      // Build messages from entries, optionally truncate tool results
      const rawMessages = entries.map((e) => e.message);
      const messages: Message[] = typeof maxToolResultChars === "number"
        ? truncateToolResults(rawMessages, maxToolResultChars)
        : rawMessages;

      yield { type: "turn_start", agentId, loopId };

      // Stream from provider
      let turnUsage: Usage = zeroUsage();
      let turnUsageReported = false;
      let stopReason: AssistantMessage["stopReason"] = "stop";
      const assistantBlocks: AssistantContentBlock[] = [];
      const toolCalls: ToolCallBlock[] = [];
      const toolArgBuffers = new Map<string, { name: string; argsText: string }>();
      const toolIssues: LoopToolIssueAggregate[] = [];
      let hadContextOverflow = false;
      let overflowRatio: number | undefined;
      let providerFailure: Extract<ProviderEvent, { type: "error" }> | null = null;

      /** Build a partial assistant message for commit when the turn is interrupted mid-stream. */
      const makeInterruptedMessage = (): AssistantMessage =>
        buildAssistantMessageFromContent(provider.model, assistantBlocks, turnUsage, "interrupted");

      try {
        const normalizedStream = normalizeToolStream(
          provider.stream({
            systemPrompt,
            messages,
            tools: tools.map(toolToSpec),
            temperature,
            maxOutputTokens,
            disableReasoning,
            signal,
          }),
          { suppressTextAfterMalformedTool: true },
        );

        streamLoop: for await (const event of normalizedStream) {
          if (signal.aborted) break;

          switch (event.type) {
            case "text":
              appendAssistantContentBlock(assistantBlocks, { type: "text", text: event.delta });
              yield { type: "text", agentId, loopId, delta: event.delta };
              break;

            case "thinking":
              appendAssistantContentBlock(assistantBlocks, { type: "thinking", thinking: event.delta });
              yield { type: "thinking", agentId, loopId, delta: event.delta };
              break;

            case "tool_start":
              toolArgBuffers.set(event.callId, { name: event.name, argsText: "" });
              break;

            case "tool_delta":
              toolArgBuffers.set(event.callId, {
                name: toolArgBuffers.get(event.callId)?.name ?? "",
                argsText: (toolArgBuffers.get(event.callId)?.argsText ?? "") + event.argsDelta,
              });
              break;

            case "tool_call": {
              toolArgBuffers.delete(event.callId);
              const block: ToolCallBlock = {
                type: "tool_call",
                id: event.callId,
                name: event.name,
                args: event.args,
              };
              toolCalls.push(block);
              appendAssistantContentBlock(assistantBlocks, block);
              stopReason = "tool_use";
              break;
            }

            case "tool_error": {
              if (event.callId) toolArgBuffers.delete(event.callId);
              const issue: LoopToolIssueAggregate = {
                kind: "malformed",
                reason: event.reason,
                message: event.message,
                callId: event.callId,
                name: event.name,
                argsText: event.argsText,
                textDelta: event.textDelta,
              };
              toolIssues.push(issue);
              loopToolIssues.push(issue);
              const { type: _type, ...eventFields } = event;
              yield { type: "tool_error", agentId, loopId, ...eventFields };
              break;
            }

            case "tool_cancel": {
              if (event.callId) toolArgBuffers.delete(event.callId);
              const issue: LoopToolIssueAggregate = {
                kind: "cancelled",
                reason: event.reason,
                message: event.message,
                callId: event.callId,
                name: event.name,
                argsText: event.argsText,
                textDelta: event.textDelta,
              };
              toolIssues.push(issue);
              loopToolIssues.push(issue);
              const { type: _type, ...eventFields } = event;
              yield { type: "tool_cancel", agentId, loopId, ...eventFields };
              break;
            }

            case "usage":
              turnUsage = event.usage;
              turnUsageReported = true;
              stopReason = event.finishReason ?? stopReason;
              break;

            case "error":
              if (event.contextOverflow) {
                hadContextOverflow = true;
                overflowRatio = event.overflowRatio;
                break;
              }
              providerFailure = event;
              break streamLoop;
          }
        }
      } catch (err) {
        if (signal.aborted) {
          const msg = makeInterruptedMessage();
          if (msg.content.length > 0) {
            await store.append(msg);
            recordAssistantTurn(msg, turnUsageReported ? turnUsage : undefined, toolCalls.map((toolCall) => ({
              callId: toolCall.id,
              name: toolCall.name,
              args: toolCall.args,
            })), toolIssues);
            yield { type: "turn_end", agentId, loopId, message: msg };
          }
          yield doneEvent("aborted");
          return;
        }
        yield { type: "error", agentId, loopId, error: toErrorMessage(err), retryable: false };
        yield doneEvent("error");
        return;
      }

      // Handle context overflow — max 1 compaction retry per turn
      if (hadContextOverflow) {
        if (compact && !compactionRetried) {
          const fillRatio = computeFillRatio(messages) ?? overflowRatio;
          const compaction = compact({
            entries,
            store,
            provider,
            usage: lastUsage,
            force: true,
            fillRatio,
          });
          if (compaction) {
            yield { type: "compaction_start", agentId, loopId };
            await compaction;
            yield { type: "compaction_end", agentId, loopId };
            compactionRetried = true;
            // Retry this turn (don't increment turn counter)
            continue;
          }
        }
        // No compact function or compact returned null on force — give up
        yield {
          type: "error",
          agentId,
          loopId,
          error: "Context window exceeded",
          retryable: false,
          contextOverflow: true,
          overflowRatio: overflowRatio ?? computeFillRatio(messages),
        };
        yield doneEvent("context_overflow");
        return;
      }

      if (providerFailure) {
        yield {
          type: "error",
          agentId,
          loopId,
          error: providerFailure.error,
          retryable: providerFailure.retryable,
          contextOverflow: providerFailure.contextOverflow,
        };
        yield doneEvent("error");
        return;
      }

      if (signal.aborted) {
        const msg = makeInterruptedMessage();
        if (msg.content.length > 0) {
          await store.append(msg);
          recordAssistantTurn(msg, turnUsageReported ? turnUsage : undefined, toolCalls.map((toolCall) => ({
            callId: toolCall.id,
            name: toolCall.name,
            args: toolCall.args,
          })), toolIssues);
          yield { type: "turn_end", agentId, loopId, message: msg };
        }
        yield doneEvent("aborted");
        return;
      }

      const assistantMessage = buildAssistantMessageFromContent(provider.model, assistantBlocks, turnUsage, stopReason);

      await store.append(assistantMessage);
      lastUsage = turnUsage;

      const aggregateToolCalls: LoopToolCallAggregate[] = toolCalls.map((toolCall) => ({
        callId: toolCall.id,
        name: toolCall.name,
        args: toolCall.args,
      }));
      // Record immediately after persistence; tool execution patches results/errors into this same array.
      recordAssistantTurn(assistantMessage, turnUsageReported ? turnUsage : undefined, aggregateToolCalls, toolIssues);

      // Deduct credits
      if (creditStore && turnUsage.creditsUsed && turnUsage.creditsUsed > 0) {
        await creditStore.deduct(turnUsage.creditsUsed);
      }

      // No tool calls — turn is done
      if (toolCalls.length === 0) {
        yield { type: "turn_end", agentId, loopId, message: assistantMessage };
        yield doneEvent("stop");
        return;
      }

      const aggregateToolCallMap = new Map(aggregateToolCalls.map((toolCall) => [toolCall.callId, toolCall]));
      const updateAggregateToolCall = (callId: string, patch: Partial<LoopToolCallAggregate>) => {
        const aggregateToolCall = aggregateToolCallMap.get(callId);
        if (aggregateToolCall) Object.assign(aggregateToolCall, patch);
      };

      // Execute tool calls
      for (const tc of toolCalls) {
        const tool = toolMap.get(tc.name);
        if (!tool) {
          // Unknown tool — report error to LLM
          const errorMsg = `Unknown tool: ${tc.name}`;
          await appendToolResult(tc.id, tc.name, errorMsg, true);
          updateAggregateToolCall(tc.id, { result: errorMsg, isError: true });
          yield {
            type: "tool_end",
            agentId,
            loopId,
            callId: tc.id,
            name: tc.name,
            result: errorMsg,
            isError: true,
          };
          continue;
        }

        // Validate input
        const inputResult = tool.def.inputSchema.safeParse(tc.args);
        if (!inputResult.success) {
          const errorMsg = formatToolValidationError(tool, tc.args, inputResult.error);
          await appendToolResult(tc.id, tc.name, errorMsg, true);
          updateAggregateToolCall(tc.id, { result: errorMsg, isError: true });
          yield {
            type: "tool_end",
            agentId,
            loopId,
            callId: tc.id,
            name: tc.name,
            result: errorMsg,
            isError: true,
          };
          continue;
        }

        const validatedInput = inputResult.data;
        updateAggregateToolCall(tc.id, { args: validatedInput });

        // Only expose a durable tool start once the call has executable input.
        yield { type: "tool_start", agentId, loopId, callId: tc.id, name: tc.name };
        yield { type: "tool_call", agentId, loopId, callId: tc.id, name: tc.name, args: validatedInput };

        // Client tool — pause and wait for consumer
        if (tool.kind === "client") {
          yield {
            type: "action_request",
            agentId,
            loopId,
            kind: "client_tool",
            callId: tc.id,
            name: tc.name,
            args: validatedInput,
          };
          const response = await pullMatching(
            (event): event is Extract<InboundEvent, { type: "tool_result" }> =>
              event.type === "tool_result" && event.callId === tc.id,
          );
          await appendToolResult(tc.id, tc.name, response.result);
          updateAggregateToolCall(tc.id, { result: response.result });
          yield { type: "tool_end", agentId, loopId, callId: tc.id, name: tc.name, result: response.result };
          continue;
        }

        // Server tool with approval
        if (tool.def.needsApproval) {
          yield {
            type: "action_request",
            agentId,
            loopId,
            kind: "approval",
            callId: tc.id,
            name: tc.name,
            args: validatedInput,
          };
          const response = await pullMatching(
            (event): event is Extract<InboundEvent, { type: "approval_response" }> =>
              event.type === "approval_response" && event.callId === tc.id,
          );
          if (!response.approved) {
            await appendToolResult(tc.id, tc.name, "User denied this action", true);
            updateAggregateToolCall(tc.id, { result: "User denied this action", isError: true });
            yield {
              type: "tool_end",
              agentId,
              loopId,
              callId: tc.id,
              name: tc.name,
              result: "User denied this action",
              isError: true,
            };
            continue;
          }
        }

        // Execute server tool with custom approval support
        try {
          // Approval infrastructure — lets tool handlers call ctx.requestApproval()
          const approvalQueue: Array<{
            id: string;
            message: string;
            resolve: (approved: boolean) => void;
          }> = [];
          const clientToolQueue: Array<{
            id: string;
            name: string;
            args: unknown;
            resolve: (result: unknown) => void;
          }> = [];
          let queueNotify: (() => void) | null = null;
          let approvalCounter = 0;
          let clientToolCounter = 0;

          const ctx: ToolContext = {
            signal,
            requestApproval(message: string) {
              return new Promise((resolve) => {
                const id = `${tc.id}-approval-${approvalCounter++}`;
                approvalQueue.push({ id, message, resolve });
                queueNotify?.();
              });
            },
            requestClientTool<T = unknown>(name: string, args: unknown) {
              return new Promise<T>((resolve) => {
                const id = `${tc.id}-client-${clientToolCounter++}`;
                clientToolQueue.push({ id, name, args, resolve: resolve as (result: unknown) => void });
                queueNotify?.();
              });
            },
          };

          const resultPromise = tool.execute(validatedInput, ctx);

          // Supervise: race between tool completion and queued sub-requests
          let result: unknown;
          let done = false;
          while (!done) {
            const settled = await Promise.race([
              resultPromise.then((r) => ({ kind: "done" as const, result: r })),
              new Promise<{ kind: "queue" }>((resolve) => {
                if (approvalQueue.length > 0 || clientToolQueue.length > 0) resolve({ kind: "queue" });
                else queueNotify = () => resolve({ kind: "queue" });
              }),
            ]);

            if (settled.kind === "done") {
              result = settled.result;
              done = true;
            } else {
              // Drain pending approval requests
              while (approvalQueue.length > 0) {
                const req = approvalQueue.shift()!;
                yield {
                  type: "action_request",
                  agentId,
                  loopId,
                  kind: "custom_approval" as const,
                  callId: req.id,
                  name: tc.name,
                  args: validatedInput,
                  message: req.message,
                };
                const response = await pullMatching(
                  (event): event is Extract<InboundEvent, { type: "approval_response" }> =>
                    event.type === "approval_response" && event.callId === req.id,
                );
                req.resolve(response.approved);
              }
              while (clientToolQueue.length > 0) {
                const req = clientToolQueue.shift()!;
                yield {
                  type: "action_request",
                  agentId,
                  loopId,
                  kind: "client_tool" as const,
                  callId: req.id,
                  name: req.name,
                  args: req.args,
                };
                const response = await pullMatching(
                  (event): event is Extract<InboundEvent, { type: "tool_result" }> =>
                    event.type === "tool_result" && event.callId === req.id,
                );
                req.resolve(response.result);
              }
              queueNotify = null;
            }
          }

          // Validate output
          if (tool.def.outputSchema) {
            const outputResult = tool.def.outputSchema.safeParse(result);
            if (!outputResult.success) {
              const errorMsg = `Output validation error: ${outputResult.error.message}`;
              await appendToolResult(tc.id, tc.name, errorMsg, true);
              updateAggregateToolCall(tc.id, { result: errorMsg, isError: true });
              yield { type: "tool_end", agentId, loopId, callId: tc.id, name: tc.name, result: errorMsg, isError: true };
              continue;
            }
          }

          await appendToolResult(tc.id, tc.name, result);
          updateAggregateToolCall(tc.id, { result });
          yield { type: "tool_end", agentId, loopId, callId: tc.id, name: tc.name, result };
        } catch (err) {
          const errorMsg = toErrorMessage(err);
          await appendToolResult(tc.id, tc.name, errorMsg, true);
          updateAggregateToolCall(tc.id, { result: errorMsg, isError: true });
          yield { type: "tool_end", agentId, loopId, callId: tc.id, name: tc.name, result: errorMsg, isError: true };
        }
      }

      yield { type: "turn_end", agentId, loopId, message: assistantMessage };

      turn++;
      compactionRetried = false;
    }

    // Max turns reached
    yield doneEvent("max_turns");
    } catch (err) {
      if (signal.aborted) {
        yield doneEvent("aborted");
        return;
      }
      yield { type: "error", agentId, loopId, error: toErrorMessage(err), retryable: false };
      yield doneEvent("error");
      return;
    }
  }

  // Wrap the generator to support subscribe()
  const generator = run();

  const loop: NessiLoop = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          // Drain synchronously-injected events first (e.g. from abort()).
          // Subscribers were already notified at injection time — don't re-fire.
          if (pendingInjections.length > 0) {
            return { value: pendingInjections.shift()!, done: false };
          }
          const result = await generator.next();
          if (!result.done && result.value) {
            for (const listener of subscribers) {
              listener(result.value);
            }
          }
          return result;
        },
        async return(value?: OutboundEvent) {
          return generator.return(value as OutboundEvent);
        },
        async throw(err?: unknown) {
          return generator.throw(err);
        },
      };
    },
    subscribe(listener: (event: OutboundEvent) => void) {
      subscribers.push(listener);
      return () => {
        const idx = subscribers.indexOf(listener);
        if (idx >= 0) subscribers.splice(idx, 1);
      };
    },
    push(event: InboundEvent) {
      channel.push(event);
    },
    steer(message: string) {
      if (message.trim()) {
        steerQueue.push(message);
      }
    },
    abort() {
      if (interrupted) return;
      interrupted = true;
      abortController.abort();
      const event: OutboundEvent = { type: "interrupted", agentId, loopId };
      // Synchronous notification — UI can react without waiting for the generator to drain.
      for (const listener of subscribers) {
        try { listener(event); } catch { /* isolate listener errors */ }
      }
      // Also buffer for for-await consumers.
      pendingInjections.push(event);
    },
  };

  return loop;
}
