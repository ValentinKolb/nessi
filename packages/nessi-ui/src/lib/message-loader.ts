/**
 * Rebuild UI messages from persisted nessi StoreEntry format.
 * Pure function — no side effects, no signals, no component state.
 */

import { humanId } from "human-id";
import type {
  AssistantMessage,
  LoopAggregate,
  LoopToolCallAggregate,
  LoopToolIssueAggregate,
  LoopTurnAggregate,
  StoreEntry,
  Usage,
} from "@valentinkolb/nessi";
import type { NessiIssue } from "@valentinkolb/nessi/ai";
import type { UIMessage, UIBlock, UIAssistantMessage } from "../components/chat/types.js";
import { contentPartsToUIContent } from "./chat-content.js";
import { fileMetasForMessage } from "./chat-files.js";
import { loadPersistedEntries } from "./store.js";
import { inlineToolHandlers } from "./inline-tool-blocks.js";

const msgId = () => humanId({ separator: "-", capitalize: false });
type ToolResult = { result: unknown; isError?: boolean };
type LoopIssueAggregate = NessiIssue;

const compactPreview = (text: string, max = 1200) =>
  text.length <= max ? text : `${text.slice(0, max)}...`;

const cloneUsage = (usage: Usage | undefined): Usage | undefined =>
  usage ? { ...usage } : undefined;

const hasUsageValue = (usage: Usage | undefined) =>
  Boolean(usage && (usage.input > 0 || usage.output > 0 || usage.total > 0 || (usage.cacheRead ?? 0) > 0 || (usage.creditsUsed ?? 0) > 0));

const addUsage = (left: Usage | undefined, right: Usage | undefined): Usage | undefined => {
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
};

const cloneToolCall = (toolCall: LoopToolCallAggregate): LoopToolCallAggregate => ({ ...toolCall });

const cloneToolIssue = (issue: LoopToolIssueAggregate): LoopToolIssueAggregate => ({ ...issue });

const cloneIssue = (issue: LoopIssueAggregate): LoopIssueAggregate => ({ ...issue });

const isToolStreamIssue = (issue: LoopIssueAggregate): issue is LoopToolIssueAggregate =>
  issue.kind === "malformed_tool_call" || issue.kind === "cancelled_tool_call";

const cloneTurn = (turn: LoopTurnAggregate): LoopTurnAggregate => ({
  ...turn,
  usage: cloneUsage(turn.usage),
  toolCalls: turn.toolCalls.map(cloneToolCall),
  ...(turn.toolIssues ? { toolIssues: turn.toolIssues.map(cloneToolIssue) } : {}),
  ...(turn.issues ? { issues: turn.issues.map(cloneIssue) } : {}),
});

const issuesFromAggregate = (aggregate: LoopAggregate): LoopIssueAggregate[] =>
  (aggregate.issues ?? aggregate.toolIssues ?? aggregate.turns.flatMap((turn) => turn.issues ?? turn.toolIssues ?? []))
    .map(cloneIssue);

const toolIssuesFromAggregate = (aggregate: LoopAggregate): LoopToolIssueAggregate[] =>
  (aggregate.toolIssues ?? aggregate.turns.flatMap((turn) => turn.toolIssues ?? [])).map(cloneToolIssue);

const aggregateFromTurns = (
  turns: LoopTurnAggregate[],
  loopIssues: LoopIssueAggregate[] = [],
): LoopAggregate => {
  const clonedTurns = turns.map(cloneTurn);
  const usage = clonedTurns.reduce<Usage | undefined>((total, turn) => addUsage(total, turn.usage), undefined);
  const issues = loopIssues.length > 0
    ? loopIssues.map(cloneIssue)
    : clonedTurns.flatMap((turn) => turn.issues ?? turn.toolIssues ?? []);
  const toolIssues = issues.filter(isToolStreamIssue);
  const toolCallCount = clonedTurns.reduce((count, turn) => count + turn.toolCalls.length, 0);
  const toolErrorCount = clonedTurns.reduce(
    (count, turn) => count + turn.toolCalls.filter((toolCall) => toolCall.isError).length,
    0,
  );

  return {
    turns: clonedTurns,
    usage,
    issueCount: issues.length,
    issues: issues.map(cloneIssue),
    toolCallCount,
    toolErrorCount,
    toolIssueCount: toolIssues.length,
    toolMalformedCount: toolIssues.filter((issue) => issue.kind === "malformed_tool_call").length,
    toolCancelledCount: toolIssues.filter((issue) => issue.kind === "cancelled_tool_call").length,
    toolIssues: toolIssues.map(cloneToolIssue),
    assistantMessageCount: clonedTurns.length,
  };
};

const cloneAggregate = (aggregate: LoopAggregate): LoopAggregate => {
  const turns = aggregate.turns.map(cloneTurn);
  const issues = issuesFromAggregate(aggregate);
  const toolIssues = toolIssuesFromAggregate(aggregate);
  return {
    turns,
    usage: cloneUsage(aggregate.usage),
    issueCount: aggregate.issueCount ?? issues.length,
    issues,
    toolCallCount: aggregate.toolCallCount,
    toolErrorCount: aggregate.toolErrorCount,
    toolIssueCount: aggregate.toolIssueCount ?? toolIssues.length,
    toolMalformedCount: aggregate.toolMalformedCount ?? toolIssues.filter((issue) => issue.kind === "malformed_tool_call").length,
    toolCancelledCount: aggregate.toolCancelledCount ?? toolIssues.filter((issue) => issue.kind === "cancelled_tool_call").length,
    toolIssues,
    assistantMessageCount: aggregate.assistantMessageCount,
  };
};

const mergeAggregates = (left: LoopAggregate | undefined, right: LoopAggregate) =>
  aggregateFromTurns(
    [...(left?.turns ?? []), ...right.turns],
    [...(left ? issuesFromAggregate(left) : []), ...issuesFromAggregate(right)],
  );

const assistantTurnAggregate = (
  message: AssistantMessage,
  toolResults: Map<string, ToolResult>,
): LoopTurnAggregate => {
  const toolCalls: LoopToolCallAggregate[] = message.content
    .filter((block): block is Extract<typeof message.content[number], { type: "tool_call" }> => block.type === "tool_call")
    .map((block) => {
      const result = toolResults.get(block.id);
      return {
        callId: block.id,
        name: block.name,
        args: block.args,
        result: result?.result,
        isError: result?.isError,
      };
    });

  return {
    message,
    usage: hasUsageValue(message.usage) ? message.usage : undefined,
    stopReason: message.stopReason,
    toolCalls,
  };
};

const collectToolResultsByAssistantSeq = (entries: StoreEntry[]) => {
  const pendingToolCalls = new Map<string, number[]>();
  const toolResultsByAssistantSeq = new Map<number, Map<string, ToolResult>>();

  for (const entry of entries) {
    if (entry.kind === "summary") continue;
    const message = entry.message;

    if (message.role === "assistant") {
      for (const block of message.content) {
        if (block.type !== "tool_call") continue;
        const pending = pendingToolCalls.get(block.id) ?? [];
        pending.push(entry.seq);
        pendingToolCalls.set(block.id, pending);
      }
      continue;
    }

    if (message.role === "tool_result" && message.callId) {
      const pending = pendingToolCalls.get(message.callId);
      const assistantSeq = pending?.shift();
      if (pending && pending.length === 0) pendingToolCalls.delete(message.callId);
      if (assistantSeq === undefined) continue;

      const results = toolResultsByAssistantSeq.get(assistantSeq) ?? new Map<string, ToolResult>();
      results.set(message.callId, { result: message.result, isError: message.isError });
      toolResultsByAssistantSeq.set(assistantSeq, results);
    }
  }

  return toolResultsByAssistantSeq;
};

const summaryTextFromEntry = (entry: StoreEntry): string | undefined => {
  const message = entry.message;
  if (message.role === "assistant") {
    const text = message.content
      .filter((block): block is Extract<typeof message.content[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return text || undefined;
  }
  if (message.role === "user") {
    const text = message.content
      .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
      .join("\n")
      .trim();
    return text || undefined;
  }
  return undefined;
};

export { summaryTextFromEntry, compactPreview };

export const loadMessages = async (chatId: string): Promise<UIMessage[]> => {
  const entries = await loadPersistedEntries(chatId);
  const toolResultsByAssistantSeq = collectToolResultsByAssistantSeq(entries);

  const messages: UIMessage[] = [];
  let lastUserTimestamp: string | undefined;
  for (const entry of entries) {
    if (entry.kind === "summary") {
      const summaryText = summaryTextFromEntry(entry);
      if (summaryText) {
        messages.push({
          id: msgId(),
          role: "assistant",
          blocks: [{
            type: "compaction",
            title: "Checkpoint summary",
            message: "Older history was condensed into a checkpoint summary.",
            sessionName: "main",
            applied: true,
            reason: "stop",
            summaryPreview: compactPreview(summaryText),
          }],
          meta: {
            entrySeq: entry.seq,
            timestamp: entry.createdAt,
          },
        });
      }
      continue;
    }
    const message = entry.message;

    if (message.role === "user") {
      const fileParts = (await fileMetasForMessage(chatId, entry.seq)).map((file) => ({
        type: "file" as const,
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      }));
      messages.push({
        id: msgId(),
        role: "user",
        content: [...contentPartsToUIContent(message.content), ...fileParts],
        timestamp: entry.createdAt,
        entrySeq: entry.seq,
      });
      lastUserTimestamp = entry.createdAt;
      continue;
    }

    if (message.role !== "assistant") continue;
    const toolResults = toolResultsByAssistantSeq.get(entry.seq) ?? new Map<string, ToolResult>();
    const content = message.content as Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      args?: unknown;
      id?: string;
    }>;

    const blocks: UIBlock[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text?.trim()) {
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "thinking" && block.thinking) {
        blocks.push({ type: "thinking", text: block.thinking });
      } else if (block.type === "tool_call" && block.id && block.name) {
        const result = toolResults.get(block.id);
        const args = (block.args ?? {}) as Record<string, unknown>;

        blocks.push({
          type: "tool_call",
          callId: block.id,
          name: block.name,
          args,
          result: result?.result,
          isError: result?.isError,
        });

        const handler = inlineToolHandlers[block.name];
        const fromArgsBlock = handler?.fromArgs?.(args, block.id) ?? null;
        if (fromArgsBlock) blocks.push(fromArgsBlock);

        if (result !== undefined && !result.isError) {
          const produced = handler?.fromResult?.(result.result, args, block.id) ?? null;
          if (produced) {
            if ("type" in produced && typeof produced.type === "string") {
              blocks.push(produced as UIBlock);
            } else if (fromArgsBlock) {
              const last = blocks[blocks.length - 1];
              if (last && last === fromArgsBlock) {
                blocks[blocks.length - 1] = { ...fromArgsBlock, ...(produced as Partial<UIBlock>) } as UIBlock;
              }
            }
          }
        }
      }
    }

    const turnAggregate = assistantTurnAggregate(message, toolResults);
    const fallbackAggregate = aggregateFromTurns([turnAggregate]);
    const entryAggregate = entry.loopAggregate ? cloneAggregate(entry.loopAggregate) : fallbackAggregate;

    const durationMs = lastUserTimestamp && entry.createdAt
      ? Math.max(0, new Date(entry.createdAt).getTime() - new Date(lastUserTimestamp).getTime())
      : undefined;

    // Merge consecutive assistant entries into a single UI message (matches live behavior)
    const prev = messages[messages.length - 1];
    if (prev && prev.role === "assistant") {
      (prev as UIAssistantMessage).blocks.push(...blocks);
      const meta = (prev as UIAssistantMessage).meta;
      if (meta) {
        const loopAggregate = entry.loopAggregate
          ? entryAggregate
          : mergeAggregates(meta.loopAggregate, fallbackAggregate);
        meta.entrySeq = entry.seq;
        meta.timestamp = entry.createdAt;
        meta.model = message.model ?? meta.model;
        meta.usage = loopAggregate.usage ?? message.usage ?? meta.usage;
        meta.stopReason = message.stopReason ?? meta.stopReason;
        meta.doneReason = entry.loopDoneReason ?? meta.doneReason;
        meta.loopAggregate = loopAggregate;
        if (durationMs !== undefined) meta.durationMs = durationMs;
      }
    } else {
      messages.push({
        id: msgId(),
        role: "assistant",
        blocks,
        meta: {
          entrySeq: entry.seq,
          timestamp: entry.createdAt,
          startedAt: lastUserTimestamp,
          model: message.model,
          usage: entryAggregate.usage ?? message.usage,
          stopReason: message.stopReason,
          doneReason: entry.loopDoneReason,
          loopAggregate: entryAggregate,
          durationMs,
        },
      });
    }
  }

  return messages;
};
