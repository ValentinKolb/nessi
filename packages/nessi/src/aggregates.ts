// ============================================================================
// nessi - Loop aggregate helpers
// ============================================================================

import type { LoopAggregate, LoopToolCallAggregate, LoopTurnAggregate, Usage } from "./types.js";

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

const cloneTurn = (turn: LoopTurnAggregate): LoopTurnAggregate => ({
  ...turn,
  usage: cloneUsage(turn.usage),
  toolCalls: turn.toolCalls.map(cloneToolCall),
});

export const aggregateFromTurns = (turns: LoopTurnAggregate[]): LoopAggregate => {
  const clonedTurns = turns.map(cloneTurn);
  return {
    turns: clonedTurns,
    usage: clonedTurns.reduce((usage, turn) => mergeUsage(usage, turn.usage), undefined as Usage | undefined),
    toolCallCount: clonedTurns.reduce((count, turn) => count + turn.toolCalls.length, 0),
    toolErrorCount: clonedTurns.reduce(
      (count, turn) => count + turn.toolCalls.filter((toolCall) => toolCall.isError).length,
      0,
    ),
    assistantMessageCount: clonedTurns.length,
  };
}

export const cloneLoopAggregate = (aggregate: LoopAggregate): LoopAggregate => ({
  turns: aggregate.turns.map(cloneTurn),
  usage: cloneUsage(aggregate.usage),
  toolCallCount: aggregate.toolCallCount,
  toolErrorCount: aggregate.toolErrorCount,
  assistantMessageCount: aggregate.assistantMessageCount,
});

export const mergeLoopAggregates = (
  left: LoopAggregate | undefined,
  right: LoopAggregate | undefined,
): LoopAggregate | undefined => {
  if (!left) return right ? cloneLoopAggregate(right) : undefined;
  if (!right) return cloneLoopAggregate(left);
  return aggregateFromTurns([...left.turns, ...right.turns]);
}
