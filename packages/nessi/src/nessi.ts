// ============================================================================
// nessi - Core Loop
// ============================================================================

import type {
  AssistantContentBlock,
  AssistantMessage,
  CoalesceOptions,
  DoneReason,
  InboundEvent,
  LoopIssueAggregate,
  LoopToolCallAggregate,
  LoopToolIssueAggregate,
  LoopTurnAggregate,
  Message,
  NessiIssue,
  NessiLoop,
  NessiOptions,
  OutboundEvent,
  StoreEntry,
  Tool,
  ToolCallBlock,
  ToolContext,
  ToolExecutionIssue,
  ToolResultMessage,
  Usage,
  UserMessage,
} from "./types.js";
import { aggregateFromTurns, cloneUsage } from "./aggregates.js";
import { appendAssistantContentBlock, buildAssistantMessageFromContent } from "./ai/shared/messages.js";
import { toolToSpec } from "./tools.js";
import { createLoopId, estimateTokens, toErrorMessage, truncateToolResults, zeroUsage } from "./utils.js";

// ----------------------------------------------------------------------------
// Inbound event channel
// ----------------------------------------------------------------------------

type Channel<T> = {
  push(value: T): void;
  pull(signal?: AbortSignal): Promise<T>;
  drain(): T[];
}

class PullCancelledError extends Error {
  constructor() {
    super("channel pull cancelled");
    this.name = "PullCancelledError";
  }
}

class ToolExecutionFailure extends Error {
  readonly issue: ToolExecutionIssue;

  constructor(issue: ToolExecutionIssue) {
    super(issue.message);
    this.name = "ToolExecutionFailure";
    this.issue = issue;
  }
}

const createChannel = <T>(): Channel<T> => {
  const queue: T[] = [];
  const waiters: Array<{
    resolve(value: T): void;
    reject(error: unknown): void;
    cleanup?: () => void;
  }> = [];

  return {
    push(value: T) {
      const waiter = waiters.shift();
      if (waiter) {
        waiter.cleanup?.();
        waiter.resolve(value);
      }
      else queue.push(value);
    },
    pull(signal?: AbortSignal) {
      const queued = queue.shift();
      if (queued !== undefined) return Promise.resolve(queued);
      if (signal?.aborted) return Promise.reject(new PullCancelledError());
      return new Promise((resolve, reject) => {
        const waiter = { resolve, reject } as {
          resolve(value: T): void;
          reject(error: unknown): void;
          cleanup?: () => void;
        };
        const cancel = () => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          waiter.cleanup?.();
          reject(new PullCancelledError());
        };
        if (signal) {
          waiter.cleanup = () => signal.removeEventListener("abort", cancel);
          signal.addEventListener("abort", cancel, { once: true });
        }
        waiters.push(waiter);
      });
    },
    drain() {
      return queue.splice(0, queue.length);
    },
  };
}

// ----------------------------------------------------------------------------
// Input normalization
// ----------------------------------------------------------------------------

const normalizeInput = (input: NonNullable<NessiOptions["input"]>): UserMessage => {
  if (typeof input === "string") return { role: "user", content: [{ type: "text", text: input }] };
  return {
    role: "user",
    content: input.map((part) => (typeof part === "string" ? { type: "text" as const, text: part } : part)),
  };
}

// ----------------------------------------------------------------------------
// Debug and issue helpers
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

const createTurnId = (loopId: string, turnIndex: number, suffix = "turn") => `${loopId}:${suffix}:${turnIndex}`;

const isToolStreamIssue = (issue: NessiIssue): issue is LoopToolIssueAggregate =>
  issue.kind === "malformed_tool_call" || issue.kind === "cancelled_tool_call";

const toolExecutionIssue = (
  reason: ToolExecutionIssue["reason"],
  message: string,
  call: { id: string; name: string },
): ToolExecutionIssue => ({
  kind: "tool_execution_error",
  reason,
  message,
  retryable: false,
  callId: call.id,
  name: call.name,
});

const toolTimeoutIssue = (call: { id: string; name: string }, timeoutMs: number): NessiIssue => ({
  kind: "timeout",
  scope: "tool",
  message: `Tool "${call.name}" timed out after ${timeoutMs}ms.`,
  retryable: false,
  callId: call.id,
  name: call.name,
});

const runtimeIssue = (error: unknown): NessiIssue => ({
  kind: "runtime_error",
  message: toErrorMessage(error),
  retryable: false,
});

const issueToToolResult = (issue: NessiIssue) => issue.message;

const timeoutMsFor = (tool: Tool) => {
  const timeoutMs = tool.def.timeoutMs;
  return typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : undefined;
}

const withTimeout = async <T>(
  run: (signal?: AbortSignal) => Promise<T>,
  timeoutMs: number | undefined,
  onTimeout: () => void,
): Promise<{ ok: true; value: T } | { ok: false }> => {
  if (!timeoutMs) return { ok: true, value: await run() };
  const timeoutController = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  try {
    timeout = setTimeout(() => {
      timedOut = true;
      onTimeout();
      timeoutController.abort();
    }, timeoutMs);
    return { ok: true, value: await run(timeoutController.signal) };
  } catch (error) {
    if (timedOut && error instanceof PullCancelledError) return { ok: false };
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
    timeoutController.abort();
  }
}

class LoopAbortedError extends Error {
  constructor() {
    super("nessi loop aborted");
    this.name = "LoopAbortedError";
  }
}

const linkedAbortSignal = (signals: Array<AbortSignal | undefined>) => {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  for (const signal of activeSignals) {
    const abort = () => controller.abort(signal.reason);
    if (signal.aborted) {
      abort();
      continue;
    }
    signal.addEventListener("abort", abort, { once: true });
    listeners.push(() => signal.removeEventListener("abort", abort));
  }
  return {
    signal: controller.signal,
    cleanup() {
      for (const remove of listeners) remove();
    },
  };
};

// ----------------------------------------------------------------------------
// Aggregate reconstruction
// ----------------------------------------------------------------------------

const aggregateTurnsFromEntries = (entries: StoreEntry[]): LoopTurnAggregate[] => {
  const messages = entries.filter((entry) => entry.kind === "message").map((entry) => entry.message);
  const lastAssistantIdx = messages.findLastIndex((message) => message.role === "assistant");
  if (lastAssistantIdx < 0) return [];

  let start = 0;
  for (let i = lastAssistantIdx - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      start = i + 1;
      break;
    }
  }

  const turns: LoopTurnAggregate[] = [];
  for (let i = start; i < messages.length; i++) {
    const message = messages[i];
    if (message?.role !== "assistant") continue;

    const toolCalls = message.content
      .filter((block): block is ToolCallBlock => block.type === "tool_call")
      .map((block): LoopToolCallAggregate => ({
        callId: block.id,
        name: block.name,
        args: block.args,
      }));
    const byId = new Map(toolCalls.map((toolCall) => [toolCall.callId, toolCall]));

    for (let j = i + 1; j < messages.length; j++) {
      const next = messages[j];
      if (!next || next.role === "assistant" || next.role === "user") break;
      const toolCall = byId.get(next.callId);
      if (toolCall) {
        toolCall.result = next.result;
        toolCall.isError = next.isError;
      }
    }

    turns.push({
      message,
      usage: cloneUsage(message.usage),
      stopReason: message.stopReason,
      toolCalls,
    });
  }

  return turns;
}

// ----------------------------------------------------------------------------
// Delta coalescing
// ----------------------------------------------------------------------------

type BlockDeltaOutbound = Extract<OutboundEvent, { type: "block_delta" }>;

const canMergeDelta = (left: BlockDeltaOutbound, right: BlockDeltaOutbound) =>
  left.agentId === right.agentId
  && left.loopId === right.loopId
  && left.turnId === right.turnId
  && left.blockId === right.blockId;

const coalesceOutboundEvents = async function* (
  source: AsyncIterable<OutboundEvent>,
  options: CoalesceOptions,
): AsyncGenerator<OutboundEvent> {
  const maxChars = typeof options.maxChars === "number" && options.maxChars > 0 ? options.maxChars : undefined;
  const ms = typeof options.ms === "number" && options.ms > 0 ? options.ms : undefined;
  if (!maxChars && !ms) {
    yield* source;
    return;
  }

  const iterator = source[Symbol.asyncIterator]();
  let next = iterator.next();
  let buffer: BlockDeltaOutbound | undefined;
  let timer: Promise<{ type: "timer"; seq: number }> | undefined;
  let timerSeq = 0;

  const clearTimer = () => {
    timer = undefined;
    timerSeq++;
  };

  const startTimer = () => {
    if (!ms || timer) return;
    const seq = ++timerSeq;
    timer = new Promise((resolve) => setTimeout(() => resolve({ type: "timer", seq }), ms));
  };

  const flush = function* (): Generator<OutboundEvent> {
    if (!buffer) return;
    const event = buffer;
    buffer = undefined;
    clearTimer();
    yield event;
  };

  while (true) {
    const raced = await (timer
      ? Promise.race([
          next.then((result) => ({ type: "event" as const, result })),
          timer,
        ])
      : next.then((result) => ({ type: "event" as const, result })));

    if (raced.type === "timer") {
      if (raced.seq !== timerSeq) continue;
      yield* flush();
      continue;
    }

    const { result } = raced;
    if (result.done) {
      yield* flush();
      return;
    }
    next = iterator.next();
    const event = result.value;

    if (event.type !== "block_delta") {
      yield* flush();
      yield event;
      continue;
    }

    if (!buffer) {
      buffer = event;
      startTimer();
    } else if (canMergeDelta(buffer, event)) {
      buffer = { ...buffer, delta: buffer.delta + event.delta };
    } else {
      yield* flush();
      buffer = event;
      startTimer();
    }

    if (maxChars && buffer.delta.length >= maxChars) {
      yield* flush();
    }
  }
}

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
    coalesce,
    maxToolResultChars,
    signal: externalSignal,
  } = options;

  const channel = createChannel<InboundEvent>();
  const deferredInbound: InboundEvent[] = [];
  const steerQueue: string[] = [];
  const subscribers: Array<(event: OutboundEvent) => void> = [];
  const abortController = new AbortController();
  let lastUsage: Usage = zeroUsage();
  const loopTurns: LoopTurnAggregate[] = [];
  const loopIssues: LoopIssueAggregate[] = [];
  const loopId = requestedLoopId?.trim() ? requestedLoopId : createLoopId();
  const snapshotAggregate = () => aggregateFromTurns(loopTurns, loopIssues);

  const loopEndEvent = (reason: DoneReason): Extract<OutboundEvent, { type: "loop_end" }> => ({
    type: "loop_end",
    agentId,
    loopId,
    reason,
    aggregate: snapshotAggregate(),
  });

  const recordIssue = (
    issue: NessiIssue,
    turn?: { issues: LoopIssueAggregate[]; toolIssues: LoopToolIssueAggregate[] },
  ) => {
    loopIssues.push({ ...issue });
    if (turn) {
      turn.issues.push({ ...issue });
      if (isToolStreamIssue(issue)) turn.toolIssues.push({ ...issue });
    }
  };

  const issueEvent = (
    issue: NessiIssue,
    turn?: { turnId: string; turnIndex: number },
  ): Extract<OutboundEvent, { type: "issue" }> => ({
    type: "issue",
    agentId,
    loopId,
    issue,
    ...(turn ? { turnId: turn.turnId, turnIndex: turn.turnIndex } : {}),
  });

  const recordAssistantTurn = (
    message: AssistantMessage,
    usage: Usage | undefined,
    toolCalls: LoopToolCallAggregate[],
    issues: LoopIssueAggregate[] = [],
    toolIssues: LoopToolIssueAggregate[] = [],
  ) => {
    const turn: LoopTurnAggregate = {
      message,
      usage: cloneUsage(usage),
      stopReason: message.stopReason,
      toolCalls,
      ...(issues.length > 0 ? { issues: issues.map((issue) => ({ ...issue })) } : {}),
      ...(toolIssues.length > 0 ? { toolIssues: toolIssues.map((issue) => ({ ...issue })) } : {}),
    };
    loopTurns.push(turn);
  };

  const hasBufferedInbound = (match: (event: InboundEvent) => boolean): boolean => {
    deferredInbound.push(...channel.drain());
    return deferredInbound.some(match);
  };

  const pullMatching = async <T extends InboundEvent>(
    match: (event: InboundEvent) => event is T,
    localSignal?: AbortSignal,
  ): Promise<T> => {
    while (true) {
      const bufferedIdx = deferredInbound.findIndex(match);
      if (bufferedIdx >= 0) return deferredInbound.splice(bufferedIdx, 1)[0] as T;
      if (abortController.signal.aborted) throw new LoopAbortedError();
      const linked = linkedAbortSignal([abortController.signal, localSignal]);
      let inbound: InboundEvent;
      try {
        inbound = await channel.pull(linked.signal);
      } catch (error) {
        if (error instanceof PullCancelledError && abortController.signal.aborted) {
          throw new LoopAbortedError();
        }
        throw error;
      } finally {
        linked.cleanup();
      }
      if (match(inbound)) return inbound;
      deferredInbound.push(inbound);
    }
  };

  if (externalSignal) {
    if (externalSignal.aborted) abortController.abort();
    else externalSignal.addEventListener("abort", () => abortController.abort(), { once: true });
  }

  const signal = abortController.signal;

  const names = tools.map((tool) => tool.def.name);
  if (new Set(names).size !== names.length) {
    const dup = names.find((name, index) => names.indexOf(name) !== index);
    throw new Error(`Duplicate tool name: ${dup}`);
  }
  const toolMap = new Map(tools.map((tool) => [tool.def.name, tool]));
  const isTerminalTool = (name: string) => Boolean((toolMap.get(name)?.def as { terminal?: boolean } | undefined)?.terminal);

  const appendToolResult = async (callId: string, name: string, result: unknown, isError = false) => {
    const msg: ToolResultMessage = { role: "tool_result", callId, name, result, isError };
    await store.append(msg);
    return msg;
  };

  type TurnContext = { turnId: string; turnIndex: number };
  type UpdateAggregateToolCall = (callId: string, patch: Partial<LoopToolCallAggregate>) => void;

  async function* failToolCall(
    tc: ToolCallBlock,
    turnCtx: TurnContext,
    updateAggregateToolCall: UpdateAggregateToolCall,
    issue: NessiIssue,
    turnIssues?: { issues: LoopIssueAggregate[]; toolIssues: LoopToolIssueAggregate[] },
  ): AsyncGenerator<OutboundEvent> {
    const result = issueToToolResult(issue);
    await appendToolResult(tc.id, tc.name, result, true);
    updateAggregateToolCall(tc.id, { result, isError: true });
    recordIssue(issue, turnIssues);
    yield issueEvent(issue, turnCtx);
    yield {
      type: "tool_execution_end",
      agentId,
      loopId,
      ...turnCtx,
      callId: tc.id,
      name: tc.name,
      result,
      isError: true,
    };
  }

  async function* executeToolCall(
    tc: ToolCallBlock,
    turnCtx: TurnContext,
    updateAggregateToolCall: UpdateAggregateToolCall,
    turnIssues?: { issues: LoopIssueAggregate[]; toolIssues: LoopToolIssueAggregate[] },
  ): AsyncGenerator<OutboundEvent> {
    const eventFields = { agentId, loopId, ...turnCtx };
    yield { type: "tool_execution_start", ...eventFields, callId: tc.id, name: tc.name, args: tc.args };

    const tool = toolMap.get(tc.name);
    if (!tool) {
      yield* failToolCall(
        tc,
        turnCtx,
        updateAggregateToolCall,
        toolExecutionIssue("unknown_tool", `Unknown tool: ${tc.name}`, tc),
        turnIssues,
      );
      return;
    }

    const inputResult = tool.def.inputSchema.safeParse(tc.args);
    if (!inputResult.success) {
      yield* failToolCall(
        tc,
        turnCtx,
        updateAggregateToolCall,
        toolExecutionIssue("input_validation_failed", formatToolValidationError(tool, tc.args, inputResult.error), tc),
        turnIssues,
      );
      return;
    }

    const validatedInput = inputResult.data;
    updateAggregateToolCall(tc.id, { args: validatedInput });

    const timeoutMs = timeoutMsFor(tool);
    const timeoutIssue = () => toolTimeoutIssue(tc, timeoutMs ?? 0);

    if (tool.kind === "client") {
      const matchesToolResult = (event: InboundEvent): event is Extract<InboundEvent, { type: "tool_result" }> =>
        event.type === "tool_result" && event.callId === tc.id;
      if (!hasBufferedInbound(matchesToolResult)) {
        yield {
          type: "tool_action_request",
          ...eventFields,
          kind: "client_tool",
          callId: tc.id,
          name: tc.name,
          args: validatedInput,
        };
      }

      const pulled = await withTimeout((signal) => pullMatching(matchesToolResult, signal), timeoutMs, () => {});
      if (!pulled.ok) {
        const issue = timeoutIssue();
        const result = issueToToolResult(issue);
        await appendToolResult(tc.id, tc.name, result, true);
        updateAggregateToolCall(tc.id, { result, isError: true });
        recordIssue(issue, turnIssues);
        yield issueEvent(issue, turnCtx);
        yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result, isError: true };
        return;
      }

      const output = pulled.value.result;
      if (tool.def.outputSchema) {
        const outputResult = tool.def.outputSchema.safeParse(output);
        if (!outputResult.success) {
          const issue = toolExecutionIssue(
            "output_validation_failed",
            `Output validation error for tool "${tc.name}": ${outputResult.error.message}`,
            tc,
          );
          const result = issueToToolResult(issue);
          await appendToolResult(tc.id, tc.name, result, true);
          updateAggregateToolCall(tc.id, { result, isError: true });
          recordIssue(issue, turnIssues);
          yield issueEvent(issue, turnCtx);
          yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result, isError: true };
          return;
        }
      }

      await appendToolResult(tc.id, tc.name, output);
      updateAggregateToolCall(tc.id, { result: output });
      yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result: output };
      return;
    }

    if (tool.def.needsApproval) {
      const matchesApproval = (event: InboundEvent): event is Extract<InboundEvent, { type: "approval_response" }> =>
        event.type === "approval_response" && event.callId === tc.id;
      if (!hasBufferedInbound(matchesApproval)) {
        yield {
          type: "tool_action_request",
          ...eventFields,
          kind: "approval",
          callId: tc.id,
          name: tc.name,
          args: validatedInput,
        };
      }
      const pulled = await withTimeout((signal) => pullMatching(matchesApproval, signal), timeoutMs, () => {});
      if (!pulled.ok) {
        const issue = timeoutIssue();
        const result = issueToToolResult(issue);
        await appendToolResult(tc.id, tc.name, result, true);
        updateAggregateToolCall(tc.id, { result, isError: true });
        recordIssue(issue, turnIssues);
        yield issueEvent(issue, turnCtx);
        yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result, isError: true };
        return;
      }
      if (!pulled.value.approved) {
        const issue = toolExecutionIssue("approval_denied", "User denied this action", tc);
        const result = issueToToolResult(issue);
        await appendToolResult(tc.id, tc.name, result, true);
        updateAggregateToolCall(tc.id, { result, isError: true });
        recordIssue(issue, turnIssues);
        yield issueEvent(issue, turnCtx);
        yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result, isError: true };
        return;
      }
    }

    const toolAbort = new AbortController();
    const abortTool = () => toolAbort.abort();
    if (signal.aborted) abortTool();
    else signal.addEventListener("abort", abortTool, { once: true });
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    try {
      const approvalQueue: Array<{ id: string; message: string; resolve: (approved: boolean) => void }> = [];
      const clientToolQueue: Array<{
        id: string;
        name: string;
        args: unknown;
        resolve: (result: unknown) => void;
        reject: (error: unknown) => void;
      }> = [];
      let queueNotify: (() => void) | null = null;
      let approvalCounter = 0;
      let clientToolCounter = 0;

      const ctx: ToolContext = {
        signal: toolAbort.signal,
        requestApproval(message: string) {
          return new Promise((resolve) => {
            const id = `${tc.id}-approval-${approvalCounter++}`;
            approvalQueue.push({ id, message, resolve });
            queueNotify?.();
          });
        },
        requestClientTool<T = unknown>(name: string, args: unknown) {
          return new Promise<T>((resolve, reject) => {
            const id = `${tc.id}-client-${clientToolCounter++}`;
            clientToolQueue.push({
              id,
              name,
              args,
              resolve: resolve as (result: unknown) => void,
              reject,
            });
            queueNotify?.();
          });
        },
      };

      const resultPromise = tool.execute(validatedInput, ctx);
      let timeout: Promise<{ kind: "timeout" }> | undefined;
      if (timeoutMs) {
        timeout = new Promise((resolve) => {
          timeoutHandle = setTimeout(() => {
            toolAbort.abort();
            resolve({ kind: "timeout" });
          }, timeoutMs);
        });
      }

      let result: unknown;
      let done = false;
      while (!done) {
        const waitForQueue = new Promise<{ kind: "queue" }>((resolve) => {
          if (approvalQueue.length > 0 || clientToolQueue.length > 0) resolve({ kind: "queue" });
          else queueNotify = () => resolve({ kind: "queue" });
        });
        const settled = await Promise.race([
          resultPromise.then((value) => ({ kind: "done" as const, result: value })),
          waitForQueue,
          ...(timeout ? [timeout] : []),
        ]);

        if (settled.kind === "timeout") {
          const issue = timeoutIssue();
          const timeoutResult = issueToToolResult(issue);
          await appendToolResult(tc.id, tc.name, timeoutResult, true);
          updateAggregateToolCall(tc.id, { result: timeoutResult, isError: true });
          recordIssue(issue, turnIssues);
          yield issueEvent(issue, turnCtx);
          yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result: timeoutResult, isError: true };
          return;
        }

        if (settled.kind === "done") {
          result = settled.result;
          done = true;
          continue;
        }

        while (approvalQueue.length > 0) {
          const req = approvalQueue.shift()!;
          const matchesCustomApproval = (event: InboundEvent): event is Extract<InboundEvent, { type: "approval_response" }> =>
            event.type === "approval_response" && event.callId === req.id;
          if (!hasBufferedInbound(matchesCustomApproval)) {
            yield {
              type: "tool_action_request",
              ...eventFields,
              kind: "custom_approval",
              callId: req.id,
              name: tc.name,
              args: validatedInput,
              message: req.message,
            };
          }
          const response = await withTimeout(
            (signal) => pullMatching(matchesCustomApproval, signal),
            timeoutMs,
            () => toolAbort.abort(),
          );
          if (!response.ok) {
            const issue = timeoutIssue();
            const timeoutResult = issueToToolResult(issue);
            await appendToolResult(tc.id, tc.name, timeoutResult, true);
            updateAggregateToolCall(tc.id, { result: timeoutResult, isError: true });
            recordIssue(issue, turnIssues);
            yield issueEvent(issue, turnCtx);
            yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result: timeoutResult, isError: true };
            return;
          }
          req.resolve(response.value.approved);
        }

        while (clientToolQueue.length > 0) {
          const req = clientToolQueue.shift()!;
          const bridgeTool = toolMap.get(req.name);
          let requestArgs = req.args;
          if (bridgeTool) {
            if (bridgeTool.kind !== "client") {
              req.reject(new ToolExecutionFailure(toolExecutionIssue(
                "unknown_tool",
                `Client tool "${req.name}" is not registered as a client tool.`,
                { id: req.id, name: req.name },
              )));
              continue;
            }
            const inputResult = bridgeTool.def.inputSchema.safeParse(req.args);
            if (!inputResult.success) {
              req.reject(new ToolExecutionFailure(toolExecutionIssue(
                "input_validation_failed",
                formatToolValidationError(bridgeTool, req.args, inputResult.error),
                { id: req.id, name: req.name },
              )));
              continue;
            }
            requestArgs = inputResult.data;
          }

          const matchesClientResult = (event: InboundEvent): event is Extract<InboundEvent, { type: "tool_result" }> =>
            event.type === "tool_result" && event.callId === req.id;
          if (!hasBufferedInbound(matchesClientResult)) {
            yield {
              type: "tool_action_request",
              ...eventFields,
              kind: "client_tool",
              callId: req.id,
              name: req.name,
              args: requestArgs,
            };
          }
          const response = await withTimeout(
            (signal) => pullMatching(matchesClientResult, signal),
            timeoutMs,
            () => toolAbort.abort(),
          );
          if (!response.ok) {
            const issue = timeoutIssue();
            const timeoutResult = issueToToolResult(issue);
            await appendToolResult(tc.id, tc.name, timeoutResult, true);
            updateAggregateToolCall(tc.id, { result: timeoutResult, isError: true });
            recordIssue(issue, turnIssues);
            yield issueEvent(issue, turnCtx);
            yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result: timeoutResult, isError: true };
            return;
          }
          let output = response.value.result;
          if (bridgeTool?.kind === "client" && bridgeTool.def.outputSchema) {
            const outputResult = bridgeTool.def.outputSchema.safeParse(output);
            if (!outputResult.success) {
              req.reject(new ToolExecutionFailure(toolExecutionIssue(
                "output_validation_failed",
                `Output validation error for client tool "${req.name}": ${outputResult.error.message}`,
                { id: req.id, name: req.name },
              )));
              continue;
            }
            output = outputResult.data;
          }
          req.resolve(output);
        }
        queueNotify = null;
      }

      if (tool.def.outputSchema) {
        const outputResult = tool.def.outputSchema.safeParse(result);
        if (!outputResult.success) {
          const issue = toolExecutionIssue(
            "output_validation_failed",
            `Output validation error for tool "${tc.name}": ${outputResult.error.message}`,
            tc,
          );
          const output = issueToToolResult(issue);
          await appendToolResult(tc.id, tc.name, output, true);
          updateAggregateToolCall(tc.id, { result: output, isError: true });
          recordIssue(issue, turnIssues);
          yield issueEvent(issue, turnCtx);
          yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result: output, isError: true };
          return;
        }
      }

      await appendToolResult(tc.id, tc.name, result);
      updateAggregateToolCall(tc.id, { result });
      yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result };
    } catch (error) {
      if (error instanceof LoopAbortedError || signal.aborted) throw error;
      const issue = error instanceof ToolExecutionFailure
        ? error.issue
        : toolExecutionIssue("execution_failed", toErrorMessage(error), tc);
      const result = issueToToolResult(issue);
      await appendToolResult(tc.id, tc.name, result, true);
      updateAggregateToolCall(tc.id, { result, isError: true });
      recordIssue(issue, turnIssues);
      yield issueEvent(issue, turnCtx);
      yield { type: "tool_execution_end", ...eventFields, callId: tc.id, name: tc.name, result, isError: true };
    } finally {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      signal.removeEventListener("abort", abortTool);
    }
  }

  const noopAggregateUpdate: UpdateAggregateToolCall = () => {};

  async function* runCompaction(operation: Promise<void>): AsyncGenerator<OutboundEvent> {
    yield { type: "compaction_start", agentId, loopId };
    try {
      await operation;
    } finally {
      yield { type: "compaction_end", agentId, loopId };
    }
  }

  async function* resumePendingToolCalls(turnCtx: TurnContext): AsyncGenerator<OutboundEvent> {
    const entries = await store.load();
    const seeded = aggregateTurnsFromEntries(entries);
    loopTurns.splice(0, loopTurns.length, ...seeded);

    let lastAssistantIdx = -1;
    for (let i = entries.length - 1; i >= 0; i--) {
      const role = entries[i]!.message.role;
      if (role === "user") return;
      if (role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx < 0) return;

    const entry = entries[lastAssistantIdx]!;
    if (entry.kind === "summary") return;
    const assistantMessage = entry.message as AssistantMessage;
    const toolCallBlocks = assistantMessage.content.filter((block): block is ToolCallBlock => block.type === "tool_call");
    if (toolCallBlocks.length === 0) return;

    const resolvedCallIds = new Set<string>();
    for (let i = lastAssistantIdx + 1; i < entries.length; i++) {
      const message = entries[i]!.message;
      if (message.role === "tool_result") resolvedCallIds.add(message.callId);
    }

    const pending = toolCallBlocks.filter((block) => !resolvedCallIds.has(block.id));
    if (pending.length === 0) return;

    const aggregateTurn = loopTurns.findLast((turn) => turn.message === assistantMessage);
    const aggregateToolCallMap = new Map((aggregateTurn?.toolCalls ?? []).map((toolCall) => [toolCall.callId, toolCall]));
    const updateAggregateToolCall = aggregateTurn
      ? (callId: string, patch: Partial<LoopToolCallAggregate>) => {
          const aggregateToolCall = aggregateToolCallMap.get(callId);
          if (aggregateToolCall) Object.assign(aggregateToolCall, patch);
        }
      : noopAggregateUpdate;

    const turnIssues = { issues: [] as LoopIssueAggregate[], toolIssues: [] as LoopToolIssueAggregate[] };
    yield { type: "turn_start", agentId, loopId, ...turnCtx, resumed: true };
    for (const tc of pending) {
      if (signal.aborted) return;
      yield* executeToolCall(tc, turnCtx, updateAggregateToolCall, turnIssues);
    }
    if (aggregateTurn && turnIssues.issues.length > 0) {
      aggregateTurn.issues = [...(aggregateTurn.issues ?? []), ...turnIssues.issues.map((issue) => ({ ...issue }))];
      aggregateTurn.toolIssues = [
        ...(aggregateTurn.toolIssues ?? []),
        ...turnIssues.toolIssues.map((issue) => ({ ...issue })),
      ];
    }
    yield { type: "turn_end", agentId, loopId, ...turnCtx, message: assistantMessage };
  }

  async function* run(): AsyncGenerator<OutboundEvent> {
    let providerTurn = 0;
    let eventTurnIndex = 0;
    let compactionRetried = false;

    yield { type: "loop_start", agentId, loopId };

    try {
      if (input !== undefined) {
        await store.append(normalizeInput(input));
      } else {
        const resumeCtx = { turnId: createTurnId(loopId, eventTurnIndex, "resume"), turnIndex: eventTurnIndex };
        let emittedResumeTurn = false;
        for await (const event of resumePendingToolCalls(resumeCtx)) {
          emittedResumeTurn = true;
          yield event;
        }
        if (emittedResumeTurn) eventTurnIndex++;
        if (signal.aborted) {
          yield loopEndEvent("aborted");
          return;
        }
      }

      while (providerTurn < maxTurns) {
        if (signal.aborted) {
          yield loopEndEvent("aborted");
          return;
        }

        if (creditStore) {
          const remaining = await creditStore.remaining();
          if (remaining <= 0) {
            yield loopEndEvent("no_credits");
            return;
          }
        }

        while (steerQueue.length > 0) {
          const text = steerQueue.shift()!;
          const steerMessage: UserMessage = { role: "user", content: [{ type: "text", text }] };
          await store.append(steerMessage);
          providerTurn = 0;
          compactionRetried = false;
          yield { type: "steer_applied", agentId, loopId, message: text };
        }

        let entries = await store.load();
        const contextWindow = provider.contextWindow;
        const computeFillRatio = (messages: Message[]) => {
          if (typeof contextWindow !== "number" || contextWindow <= 0) return undefined;
          const tokens = lastUsage.total > 0 ? lastUsage.total : estimateTokens(messages);
          return tokens / contextWindow;
        };

        if (compact && !compactionRetried) {
          const fillRatio = computeFillRatio(entries.map((entry) => entry.message));
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
            yield* runCompaction(compaction);
            entries = await store.load();
          }
        }

        const rawMessages = entries.map((entry) => entry.message);
        const messages: Message[] = typeof maxToolResultChars === "number"
          ? truncateToolResults(rawMessages, maxToolResultChars)
          : rawMessages;

        const turnCtx = { turnId: createTurnId(loopId, eventTurnIndex), turnIndex: eventTurnIndex };
        eventTurnIndex++;
        yield { type: "turn_start", agentId, loopId, ...turnCtx };

        let turnUsage: Usage = zeroUsage();
        let turnUsageReported = false;
        let stopReason: AssistantMessage["stopReason"] = "stop";
        const assistantBlocks: AssistantContentBlock[] = [];
        const openBlocks = new Map<string, { index: number; kind: "text" | "thinking"; text: string }>();
        const toolCalls: ToolCallBlock[] = [];
        const turnIssues = { issues: [] as LoopIssueAggregate[], toolIssues: [] as LoopToolIssueAggregate[] };
        let hadContextOverflow = false;
        let overflowRatio: number | undefined;
        let providerFailure: NessiIssue | undefined;

        const eventFields = { agentId, loopId, ...turnCtx };
        const makePartialMessage = (reason: AssistantMessage["stopReason"]): AssistantMessage => {
          const content = [...assistantBlocks];
          const pendingBlocks = [...openBlocks.entries()]
            .sort((left, right) => left[1].index - right[1].index)
            .map(([, block]): AssistantContentBlock =>
              block.kind === "thinking"
                ? { type: "thinking", thinking: block.text }
                : { type: "text", text: block.text },
            );
          for (const block of pendingBlocks) appendAssistantContentBlock(content, block);
          return buildAssistantMessageFromContent(provider.model, content, turnUsage, reason);
        };

        try {
          streamLoop: for await (const event of provider.stream({
            systemPrompt,
            messages,
            tools: tools.map(toolToSpec),
            temperature,
            maxOutputTokens,
            disableReasoning,
            signal,
          })) {
            if (signal.aborted) break;

            switch (event.type) {
              case "block_start":
                if (event.kind === "text" || event.kind === "thinking") {
                  openBlocks.set(event.blockId, { index: event.index, kind: event.kind, text: "" });
                }
                yield { ...event, ...eventFields };
                break;

              case "block_delta": {
                const open = openBlocks.get(event.blockId);
                if (open) open.text += event.delta;
                yield { ...event, ...eventFields };
                break;
              }

              case "block_end":
                openBlocks.delete(event.blockId);
                appendAssistantContentBlock(assistantBlocks, event.block);
                if (event.block.type === "tool_call") {
                  toolCalls.push(event.block);
                  stopReason = "tool_use";
                }
                yield { ...event, ...eventFields };
                break;

              case "usage":
                turnUsage = event.usage;
                turnUsageReported = true;
                stopReason = event.finishReason ?? stopReason;
                yield { ...event, ...eventFields };
                break;

              case "issue":
                recordIssue(event.issue, turnIssues);
                yield issueEvent(event.issue, turnCtx);
                if (event.issue.kind === "provider_error" && event.issue.contextOverflow) {
                  hadContextOverflow = true;
                  overflowRatio = event.issue.overflowRatio;
                  break;
                }
                if (
                  event.issue.kind === "provider_error"
                  || (event.issue.kind === "timeout" && event.issue.scope !== "tool")
                  || event.issue.kind === "runtime_error"
                ) {
                  providerFailure = event.issue;
                  break streamLoop;
                }
                break;

              default: {
                const unsupported = event as { type?: unknown };
                const issue: NessiIssue = {
                  kind: "runtime_error",
                  message: `Unsupported provider event type: ${String(unsupported.type)}`,
                  retryable: false,
                };
                recordIssue(issue, turnIssues);
                yield issueEvent(issue, turnCtx);
                providerFailure = issue;
                break streamLoop;
              }
            }
          }
        } catch (error) {
          if (signal.aborted) {
            const msg = makePartialMessage("interrupted");
            if (msg.content.length > 0) {
              await store.append(msg);
              recordAssistantTurn(
                msg,
                turnUsageReported ? turnUsage : undefined,
                toolCalls.map((toolCall) => ({ callId: toolCall.id, name: toolCall.name, args: toolCall.args })),
                turnIssues.issues,
                turnIssues.toolIssues,
              );
              yield { type: "turn_end", agentId, loopId, ...turnCtx, message: msg };
            }
            yield loopEndEvent("aborted");
            return;
          }
          const issue = runtimeIssue(error);
          recordIssue(issue, turnIssues);
          yield issueEvent(issue, turnCtx);
          yield loopEndEvent("error");
          return;
        }

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
              yield* runCompaction(compaction);
              compactionRetried = true;
              continue;
            }
          }
          yield loopEndEvent("context_overflow");
          return;
        }

        if (providerFailure) {
          yield loopEndEvent("error");
          return;
        }

        if (signal.aborted) {
          const msg = makePartialMessage("interrupted");
          if (msg.content.length > 0) {
            await store.append(msg);
            recordAssistantTurn(
              msg,
              turnUsageReported ? turnUsage : undefined,
              toolCalls.map((toolCall) => ({ callId: toolCall.id, name: toolCall.name, args: toolCall.args })),
              turnIssues.issues,
              turnIssues.toolIssues,
            );
            yield { type: "turn_end", agentId, loopId, ...turnCtx, message: msg };
          }
          yield loopEndEvent("aborted");
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
        recordAssistantTurn(
          assistantMessage,
          turnUsageReported ? turnUsage : undefined,
          aggregateToolCalls,
          turnIssues.issues,
          turnIssues.toolIssues,
        );

        if (creditStore && turnUsage.creditsUsed && turnUsage.creditsUsed > 0) {
          await creditStore.deduct(turnUsage.creditsUsed);
        }

        if (toolCalls.length === 0) {
          yield { type: "turn_end", agentId, loopId, ...turnCtx, message: assistantMessage };
          yield loopEndEvent("stop");
          return;
        }

        const aggregateToolCallMap = new Map(aggregateToolCalls.map((toolCall) => [toolCall.callId, toolCall]));
        const updateAggregateToolCall = (callId: string, patch: Partial<LoopToolCallAggregate>) => {
          const aggregateToolCall = aggregateToolCallMap.get(callId);
          if (aggregateToolCall) Object.assign(aggregateToolCall, patch);
        };

        let terminalToolCompleted = false;
        for (const tc of toolCalls) {
          yield* executeToolCall(tc, turnCtx, updateAggregateToolCall, turnIssues);
          const aggregateToolCall = aggregateToolCallMap.get(tc.id);
          if (isTerminalTool(tc.name) && aggregateToolCall && !aggregateToolCall.isError) {
            terminalToolCompleted = true;
            break;
          }
        }

        const recordedTurn = loopTurns[loopTurns.length - 1];
        if (recordedTurn?.message === assistantMessage) {
          recordedTurn.issues = turnIssues.issues.map((issue) => ({ ...issue }));
          recordedTurn.toolIssues = turnIssues.toolIssues.map((issue) => ({ ...issue }));
        }

        yield { type: "turn_end", agentId, loopId, ...turnCtx, message: assistantMessage };
        if (terminalToolCompleted) {
          yield loopEndEvent("stop");
          return;
        }
        providerTurn++;
        compactionRetried = false;
      }

      yield loopEndEvent("max_turns");
    } catch (error) {
      if (signal.aborted) {
        yield loopEndEvent("aborted");
        return;
      }
      const issue = runtimeIssue(error);
      recordIssue(issue);
      yield issueEvent(issue);
      yield loopEndEvent("error");
    }
  }

  const eventSource = coalesce ? coalesceOutboundEvents(run(), coalesce) : run();
  const generator = eventSource[Symbol.asyncIterator]();

  const loop: NessiLoop = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          const result = await generator.next();
          if (!result.done && result.value) {
            for (const listener of subscribers) listener(result.value);
          }
          return result;
        },
        async return(value?: OutboundEvent) {
          return generator.return(value as OutboundEvent);
        },
        async throw(error?: unknown) {
          return generator.throw(error);
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
      if (message.trim()) steerQueue.push(message);
    },
    abort() {
      abortController.abort();
    },
  };

  return loop;
}
