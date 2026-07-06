// ============================================================================
// nessi - Loop aggregate helpers
// ============================================================================

import type {
  LoopAggregate,
  LoopToolCallAggregate,
  LoopToolIssueAggregate,
  LoopTurnAggregate,
  Usage,
} from "./types.js";

export const cloneUsage = (usage: Usage | undefined): Usage | undefined =>
  usage ? { ...usage } : undefined;

export const mergeUsage = (left: Usage | undefined, right: Usage | undefined): Usage | undefined => {
  if (!right) return cloneUsage(left);
  const next: Usage = {
    input: (left?.input ?? 0) + right.input,
    output: (left?.output ?? 0) + right.output,
    total: (left?.total ?? 0) + right.total,
  };
  if (left?.cacheRead !== undefined || right.cacheRead !== undefined) {
    next.cacheRead = (left?.cacheRead ?? 0) + (right.cacheRead ?? 0);
  }
  if (left?.creditsUsed !== undefined || right.creditsUsed !== undefined) {
    next.creditsUsed = (left?.creditsUsed ?? 0) + (right.creditsUsed ?? 0);
  }
  return next;
}

const cloneToolCall = (toolCall: LoopToolCallAggregate): LoopToolCallAggregate => ({ ...toolCall });

const cloneToolIssue = (toolIssue: LoopToolIssueAggregate): LoopToolIssueAggregate => ({ ...toolIssue });

const toolIssuesFromAggregate = (aggregate: LoopAggregate): LoopToolIssueAggregate[] =>
  (aggregate.toolIssues ?? aggregate.turns.flatMap((turn) => turn.toolIssues ?? [])).map(cloneToolIssue);

const cloneTurn = (turn: LoopTurnAggregate): LoopTurnAggregate => ({
  ...turn,
  usage: cloneUsage(turn.usage),
  toolCalls: turn.toolCalls.map(cloneToolCall),
  ...(turn.toolIssues ? { toolIssues: turn.toolIssues.map(cloneToolIssue) } : {}),
});

export const aggregateFromTurns = (
  turns: LoopTurnAggregate[],
  loopToolIssues: LoopToolIssueAggregate[] = [],
): LoopAggregate => {
  const clonedTurns = turns.map(cloneTurn);
  const toolIssues = loopToolIssues.length > 0
    ? loopToolIssues.map(cloneToolIssue)
    : clonedTurns.flatMap((turn) => turn.toolIssues ?? []);
  return {
    turns: clonedTurns,
    usage: clonedTurns.reduce((usage, turn) => mergeUsage(usage, turn.usage), undefined as Usage | undefined),
    toolCallCount: clonedTurns.reduce((count, turn) => count + turn.toolCalls.length, 0),
    toolErrorCount: clonedTurns.reduce(
      (count, turn) => count + turn.toolCalls.filter((toolCall) => toolCall.isError).length,
      0,
    ),
    toolIssueCount: toolIssues.length,
    toolMalformedCount: toolIssues.filter((issue) => issue.kind === "malformed").length,
    toolCancelledCount: toolIssues.filter((issue) => issue.kind === "cancelled").length,
    toolIssues: toolIssues.map(cloneToolIssue),
    assistantMessageCount: clonedTurns.length,
  };
}

export const cloneLoopAggregate = (aggregate: LoopAggregate): LoopAggregate => {
  const turns = aggregate.turns.map(cloneTurn);
  const toolIssues = toolIssuesFromAggregate(aggregate);
  return {
    turns,
    usage: cloneUsage(aggregate.usage),
    toolCallCount: aggregate.toolCallCount,
    toolErrorCount: aggregate.toolErrorCount,
    toolIssueCount: aggregate.toolIssueCount ?? toolIssues.length,
    toolMalformedCount: aggregate.toolMalformedCount ?? toolIssues.filter((issue) => issue.kind === "malformed").length,
    toolCancelledCount: aggregate.toolCancelledCount ?? toolIssues.filter((issue) => issue.kind === "cancelled").length,
    toolIssues,
    assistantMessageCount: aggregate.assistantMessageCount,
  };
}

export const mergeLoopAggregates = (
  left: LoopAggregate | undefined,
  right: LoopAggregate | undefined,
): LoopAggregate | undefined => {
  if (!left) return right ? cloneLoopAggregate(right) : undefined;
  if (!right) return cloneLoopAggregate(left);
  return aggregateFromTurns(
    [...left.turns, ...right.turns],
    [...toolIssuesFromAggregate(left), ...toolIssuesFromAggregate(right)],
  );
}
