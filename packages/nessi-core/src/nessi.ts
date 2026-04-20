// ============================================================================
// nessi – Core Loop
// ============================================================================

import type {
  NessiOptions,
  NessiLoop,
  OutboundEvent,
  InboundEvent,
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
  StoreEntry,
} from "./types.js";
import { toolToSpec } from "./tools.js";
import { zeroUsage, toErrorMessage, estimateTokens, truncateMessages } from "./utils.js";

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

// ----------------------------------------------------------------------------
// nessi()
// ----------------------------------------------------------------------------

export const nessi = (options: NessiOptions): NessiLoop => {
  const {
    agentId = "main",
    input,
    provider,
    systemPrompt,
    tools = [],
    store,
    creditStore,
    compact,
    maxTurns = Infinity,
    maxToolResultChars,
    signal: externalSignal,
  } = options;

  const channel = createChannel<InboundEvent>();
  const deferredInbound: InboundEvent[] = [];
  const steerQueue: string[] = [];
  const subscribers: Array<(event: OutboundEvent) => void> = [];
  const abortController = new AbortController();
  let lastUsage: Usage = zeroUsage();

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
          yield { type: "done", agentId, reason: "aborted" };
          return;
        }

        // Credit check
        if (creditStore) {
          const remaining = await creditStore.remaining();
          if (remaining <= 0) {
            yield { type: "done", agentId, reason: "no_credits" };
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
          yield { type: "steer_applied", agentId, message: text };
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
          yield { type: "compaction_start", agentId };
          await compaction;
          yield { type: "compaction_end", agentId };
          entries = await store.load();
        }
      }

      // Build messages from entries, strip thinking blocks, truncate tool results
      const messages: Message[] = truncateMessages(
        entries.map((e) => e.message),
        maxToolResultChars,
      );

      yield { type: "turn_start", agentId };

      // Stream from provider
      let currentText = "";
      let currentThinking = "";
      let turnUsage: Usage = zeroUsage();
      let stopReason: AssistantMessage["stopReason"] = "stop";
      const toolCalls: ToolCallBlock[] = [];
      const toolArgBuffers = new Map<string, string>();
      let hadContextOverflow = false;
      let overflowRatio: number | undefined;
      let providerFailure: Extract<ProviderEvent, { type: "error" }> | null = null;

      try {
        streamLoop: for await (const event of provider.stream({
          systemPrompt,
          messages,
          tools: tools.map(toolToSpec),
          signal,
        })) {
          if (signal.aborted) break;

          switch (event.type) {
            case "text":
              currentText += event.delta;
              yield { type: "text", agentId, delta: event.delta };
              break;

            case "thinking":
              currentThinking += event.delta;
              yield { type: "thinking", agentId, delta: event.delta };
              break;

            case "tool_start":
              toolArgBuffers.set(event.callId, "");
              yield { type: "tool_start", agentId, callId: event.callId, name: event.name };
              break;

            case "tool_delta":
              toolArgBuffers.set(event.callId, (toolArgBuffers.get(event.callId) ?? "") + event.argsDelta);
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
              stopReason = "tool_use";
              break;
            }

            case "usage":
              turnUsage = event.usage;
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
        yield { type: "error", agentId, error: toErrorMessage(err), retryable: false };
        yield { type: "done", agentId, reason: "error" };
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
            yield { type: "compaction_start", agentId };
            await compaction;
            yield { type: "compaction_end", agentId };
            compactionRetried = true;
            // Retry this turn (don't increment turn counter)
            continue;
          }
        }
        // No compact function or compact returned null on force — give up
        yield {
          type: "error",
          agentId,
          error: "Context window exceeded",
          retryable: false,
          contextOverflow: true,
          overflowRatio: overflowRatio ?? computeFillRatio(messages),
        };
        yield { type: "done", agentId, reason: "context_overflow" };
        return;
      }

      if (providerFailure) {
        yield {
          type: "error",
          agentId,
          error: providerFailure.error,
          retryable: providerFailure.retryable,
          contextOverflow: providerFailure.contextOverflow,
        };
        yield { type: "done", agentId, reason: "error" };
        return;
      }

      if (signal.aborted) {
        yield { type: "done", agentId, reason: "aborted" };
        return;
      }

      // Build assistant message (fix D: declarative blocks)
      const assistantBlocks: AssistantContentBlock[] = [
        ...(currentText ? [{ type: "text" as const, text: currentText }] : []),
        ...(currentThinking ? [{ type: "thinking" as const, thinking: currentThinking }] : []),
        ...toolCalls,
      ];

      const assistantMessage: AssistantMessage = {
        role: "assistant",
        content: assistantBlocks,
        model: provider.model,
        usage: turnUsage,
        stopReason,
      };

      await store.append(assistantMessage);
      lastUsage = turnUsage;

      // Deduct credits
      if (creditStore && turnUsage.creditsUsed && turnUsage.creditsUsed > 0) {
        await creditStore.deduct(turnUsage.creditsUsed);
      }

      // No tool calls — turn is done
      if (toolCalls.length === 0) {
        yield { type: "turn_end", agentId, message: assistantMessage };
        yield { type: "done", agentId, reason: "stop" };
        return;
      }

      // Execute tool calls
      for (const tc of toolCalls) {
        const tool = toolMap.get(tc.name);
        if (!tool) {
          // Unknown tool — report error to LLM
          await appendToolResult(tc.id, tc.name, `Unknown tool: ${tc.name}`, true);
          yield {
            type: "tool_end",
            agentId,
            callId: tc.id,
            name: tc.name,
            result: `Unknown tool: ${tc.name}`,
            isError: true,
          };
          continue;
        }

        // Validate input
        const inputResult = tool.def.inputSchema.safeParse(tc.args);
        if (!inputResult.success) {
          const errorMsg = formatToolValidationError(tool, tc.args, inputResult.error);
          await appendToolResult(tc.id, tc.name, errorMsg, true);
          yield {
            type: "tool_end",
            agentId,
            callId: tc.id,
            name: tc.name,
            result: errorMsg,
            isError: true,
          };
          continue;
        }

        const validatedInput = inputResult.data;

        // Emit tool_call with validated args
        yield { type: "tool_call", agentId, callId: tc.id, name: tc.name, args: validatedInput };

        // Client tool — pause and wait for consumer
        if (tool.kind === "client") {
          yield {
            type: "action_request",
            agentId,
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
          yield { type: "tool_end", agentId, callId: tc.id, name: tc.name, result: response.result };
          continue;
        }

        // Server tool with approval
        if (tool.def.needsApproval) {
          yield {
            type: "action_request",
            agentId,
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
            yield {
              type: "tool_end",
              agentId,
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
              yield { type: "tool_end", agentId, callId: tc.id, name: tc.name, result: errorMsg, isError: true };
              continue;
            }
          }

          await appendToolResult(tc.id, tc.name, result);
          yield { type: "tool_end", agentId, callId: tc.id, name: tc.name, result };
        } catch (err) {
          const errorMsg = toErrorMessage(err);
          await appendToolResult(tc.id, tc.name, errorMsg, true);
          yield { type: "tool_end", agentId, callId: tc.id, name: tc.name, result: errorMsg, isError: true };
        }
      }

      yield { type: "turn_end", agentId, message: assistantMessage };

      turn++;
      compactionRetried = false;
    }

    // Max turns reached
    yield { type: "done", agentId, reason: "max_turns" };
    } catch (err) {
      if (signal.aborted) {
        yield { type: "done", agentId, reason: "aborted" };
        return;
      }
      yield { type: "error", agentId, error: toErrorMessage(err), retryable: false };
      yield { type: "done", agentId, reason: "error" };
      return;
    }
  }

  // Wrap the generator to support subscribe()
  const generator = run();

  const loop: NessiLoop = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
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
      abortController.abort();
    },
  };

  return loop;
}
