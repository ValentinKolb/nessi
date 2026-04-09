import type { AssistantMessage, CompactFn, Message, Provider, StoreEntry, Usage } from "nessi-core";
import { contentPartsToText } from "./utils.js";

const MIN_MESSAGES = 30;
const KEEP_RECENT_ENTRIES = 8;
const MAX_SOURCE_CHARS = 24_000;
const USAGE_THRESHOLD = 0.75;

export type DefaultCompactionOptions = {
  minMessages?: number;
  keepRecentEntries?: number;
  maxSourceChars?: number;
  usageThreshold?: number;
  compactEveryMessages?: number;
};

const toText = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return String(value);
  try {
    const json = JSON.stringify(value);
    return json.length > 1_000 ? `${json.slice(0, 1_000)}...` : json;
  } catch {
    return String(value);
  }
};

const messageToLine = (entry: StoreEntry) => {
  const { message } = entry;
  if (message.role === "user") {
    const text = contentPartsToText(message.content);
    return `[${entry.seq}] user: ${text}`;
  }

  if (message.role === "assistant") {
    const text = message.content.map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "thinking") return `[thinking] ${block.thinking}`;
      return `[tool_call:${block.name}] ${toText(block.args)}`;
    }).join(" ");
    return `[${entry.seq}] assistant: ${text}`;
  }

  return `[${entry.seq}] tool_result:${message.name}(${message.callId}): ${toText(message.result)}`;
};

const trimSource = (text: string, limit: number) => {
  if (text.length <= limit) return text;
  return text.slice(text.length - limit);
};

const summarize = async (provider: Provider, text: string) => {
  const prompt = [
    "Create a compact checkpoint summary of this conversation history.",
    "Keep key facts, constraints, decisions, open tasks and relevant tool results.",
    "Be concise and factual.",
    "",
    text,
  ].join("\n");

  const message: Message = {
    role: "user",
    content: [{ type: "text", text: prompt }],
  };

  let output = "";
  for await (const event of provider.stream({
    systemPrompt: "You write concise state summaries for agent memory compaction.",
    messages: [message],
    tools: [],
  })) {
    if (event.type === "text") output += event.delta;
    if (event.type === "error") throw new Error(event.error);
  }

  const summary = output.trim();
  if (!summary) throw new Error("Compaction summary model returned empty output.");
  return summary;
};

const countConversationMessages = (entries: StoreEntry[]) =>
  entries.reduce((total, entry) => total + (
    entry.kind === "message" && (entry.message.role === "user" || entry.message.role === "assistant")
      ? 1
      : 0
  ), 0);

const shouldCompact = (
  entries: StoreEntry[],
  usage: Usage,
  provider: Provider,
  force: boolean,
  options: Required<DefaultCompactionOptions>,
) => {
  if (entries.length <= options.keepRecentEntries + 1) return false;
  if (force) return true;

  if (options.compactEveryMessages > 0) {
    const messageCount = countConversationMessages(entries);
    if (messageCount >= options.compactEveryMessages && messageCount % options.compactEveryMessages === 0) {
      return true;
    }
  }

  const usageHigh = typeof provider.contextWindow === "number"
    ? usage.total >= provider.contextWindow * options.usageThreshold
    : false;
  const historyLong = countConversationMessages(entries) >= options.minMessages;
  return usageHigh || historyLong;
};

const collectAssistantToolCallIds = (entry: StoreEntry) => {
  if (entry.message.role !== "assistant") return [];
  return entry.message.content
    .filter((block) => block.type === "tool_call")
    .map((block) => block.id);
};

const hasResolvableToolResults = (entries: StoreEntry[]) => {
  const knownToolCalls = new Set<string>();
  for (const entry of entries) {
    for (const id of collectAssistantToolCallIds(entry)) {
      knownToolCalls.add(id);
    }
    if (entry.message.role === "tool_result" && !knownToolCalls.has(entry.message.callId)) {
      return false;
    }
  }
  return true;
};

const findSafeSplitIndex = (entries: StoreEntry[], keepRecentEntries: number) => {
  const preferred = Math.max(1, entries.length - keepRecentEntries);
  for (let idx = preferred; idx >= 1; idx--) {
    const recent = entries.slice(idx);
    if (recent.length === 0) continue;
    if (hasResolvableToolResults(recent)) {
      return idx;
    }
  }
  return -1;
};

/** Build the default compaction strategy used by UI sessions. */
export const createDefaultCompactFn = (rawOptions: DefaultCompactionOptions = {}): CompactFn => {
  const options: Required<DefaultCompactionOptions> = {
    minMessages: rawOptions.minMessages ?? MIN_MESSAGES,
    keepRecentEntries: rawOptions.keepRecentEntries ?? KEEP_RECENT_ENTRIES,
    maxSourceChars: rawOptions.maxSourceChars ?? MAX_SOURCE_CHARS,
    usageThreshold: rawOptions.usageThreshold ?? USAGE_THRESHOLD,
    compactEveryMessages: rawOptions.compactEveryMessages ?? (rawOptions.minMessages ?? MIN_MESSAGES),
  };

  return (ctx) => {
    const entries = ctx.entries;
    if (!shouldCompact(entries, ctx.usage, ctx.provider, ctx.force, options)) return null;

    const splitIndex = findSafeSplitIndex(entries, options.keepRecentEntries);
    if (splitIndex < 1) return null;
    const olderEntries = entries.slice(0, splitIndex);
    if (olderEntries.length === 0) return null;

    const checkpointSeq = olderEntries[olderEntries.length - 1]?.seq;
    if (typeof checkpointSeq !== "number") return null;

    const source = trimSource(olderEntries.map(messageToLine).join("\n"), options.maxSourceChars);
    if (!source.trim()) return null;

    return (async () => {
      const summaryText = await summarize(ctx.provider, source);
      const summary: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: `Checkpoint summary:\n${summaryText}` }],
      };

      await ctx.store.append(summary, { seq: checkpointSeq, kind: "summary" });
    })();
  };
};
