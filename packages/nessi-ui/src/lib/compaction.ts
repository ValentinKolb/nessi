import type { AssistantMessage, CompactFn, Message, Provider, StoreEntry, Usage } from "nessi-core";
import { contentPartsToText } from "./utils.js";

const MIN_MESSAGES = 30;
const KEEP_RECENT_LOOPS = 8;
const MAX_TOOL_CHARS = 300;
const MAX_SOURCE_CHARS = 24_000;
const USAGE_THRESHOLD = 0.75;

const DEFAULT_SYSTEM_PROMPT = "You write concise checkpoint summaries for agent memory compaction.";

export type DefaultCompactionOptions = {
  minMessages?: number;
  keepRecentLoops?: number;
  maxToolChars?: number;
  maxSourceChars?: number;
  usageThreshold?: number;
  compactEveryMessages?: number;
  compactionPrompt?: string;
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

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

/** Truncate long text keeping first half and last half with omission notice. */
const truncateMiddle = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  const omitted = text.length - 2 * half;
  return `${text.slice(0, half)}\n[... ${omitted} characters omitted ...]\n${text.slice(-half)}`;
};

// ---------------------------------------------------------------------------
// Entry → text for summarization
// ---------------------------------------------------------------------------

const messageToLine = (entry: StoreEntry, maxToolChars: number) => {
  const { message } = entry;
  if (message.role === "user") {
    const text = contentPartsToText(message.content);
    return `[${entry.seq}] user: ${text}`;
  }

  if (message.role === "assistant") {
    const text = message.content.map((block) => {
      if (block.type === "text") return block.text;
      if (block.type === "thinking") return `[thinking] ${block.thinking}`;
      return `[tool_call:${block.name}] ${truncateMiddle(toText(block.args), maxToolChars)}`;
    }).join(" ");
    return `[${entry.seq}] assistant: ${text}`;
  }

  return `[${entry.seq}] tool_result:${message.name}: ${truncateMiddle(toText(message.result), maxToolChars)}`;
};

const trimSource = (text: string, limit: number) => {
  if (text.length <= limit) return text;
  return text.slice(text.length - limit);
};

// ---------------------------------------------------------------------------
// Summarize via LLM
// ---------------------------------------------------------------------------

const summarize = async (provider: Provider, conversationText: string, promptTemplate: string) => {
  // If the prompt contains {{conversation}}, inject inline and use a short user message.
  // Otherwise treat the prompt as system prompt and send the conversation as user message.
  const hasPlaceholder = promptTemplate.includes("{{conversation}}");
  const systemPrompt = hasPlaceholder
    ? promptTemplate.replaceAll("{{conversation}}", conversationText)
    : promptTemplate;
  const userText = hasPlaceholder
    ? "Please summarize the conversation above."
    : conversationText;

  const message: Message = {
    role: "user",
    content: [{ type: "text", text: userText }],
  };

  let output = "";
  for await (const event of provider.stream({
    systemPrompt,
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

// ---------------------------------------------------------------------------
// Counting & trigger logic
// ---------------------------------------------------------------------------

const countConversationMessages = (entries: StoreEntry[]) =>
  entries.reduce((total, entry) => total + (
    entry.kind === "message" && (entry.message.role === "user" || entry.message.role === "assistant")
      ? 1
      : 0
  ), 0);

/** Count conversation loops. Each loop starts with a user message. */
const countLoops = (entries: StoreEntry[]) =>
  entries.reduce((total, entry) => total + (
    entry.kind === "message" && entry.message.role === "user" ? 1 : 0
  ), 0);

const shouldCompact = (
  entries: StoreEntry[],
  usage: Usage,
  provider: Provider,
  force: boolean,
  options: Required<Omit<DefaultCompactionOptions, "compactionPrompt">>,
) => {
  if (countLoops(entries) <= options.keepRecentLoops) return false;
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

// ---------------------------------------------------------------------------
// Split logic — loop-based (always splits at user-message boundaries)
// ---------------------------------------------------------------------------

/**
 * Find the split index so that the recent portion contains exactly
 * `keepRecentLoops` conversation loops (user messages).
 * Splitting at user-message boundaries guarantees no orphaned tool_results.
 */
const findLoopSplitIndex = (entries: StoreEntry[], keepRecentLoops: number) => {
  // Walk backwards, count user messages (loop boundaries)
  let loopsSeen = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.kind === "message" && entries[i]!.message.role === "user") {
      loopsSeen++;
      if (loopsSeen === keepRecentLoops) {
        return i > 0 ? i : -1;
      }
    }
  }
  return -1;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the default compaction strategy used by UI sessions. */
export const createDefaultCompactFn = (rawOptions: DefaultCompactionOptions = {}): CompactFn => {
  const options = {
    minMessages: rawOptions.minMessages ?? MIN_MESSAGES,
    keepRecentLoops: rawOptions.keepRecentLoops ?? KEEP_RECENT_LOOPS,
    maxToolChars: rawOptions.maxToolChars ?? MAX_TOOL_CHARS,
    maxSourceChars: rawOptions.maxSourceChars ?? MAX_SOURCE_CHARS,
    usageThreshold: rawOptions.usageThreshold ?? USAGE_THRESHOLD,
    compactEveryMessages: rawOptions.compactEveryMessages ?? (rawOptions.minMessages ?? MIN_MESSAGES),
  };
  const systemPrompt = rawOptions.compactionPrompt || DEFAULT_SYSTEM_PROMPT;

  return (ctx) => {
    const entries = ctx.entries;
    if (!shouldCompact(entries, ctx.usage, ctx.provider, ctx.force, options)) return null;

    const splitIndex = findLoopSplitIndex(entries, options.keepRecentLoops);
    if (splitIndex < 1) return null;
    const olderEntries = entries.slice(0, splitIndex);
    if (olderEntries.length === 0) return null;

    const checkpointSeq = olderEntries[olderEntries.length - 1]?.seq;
    if (typeof checkpointSeq !== "number") return null;

    const source = trimSource(
      olderEntries.map((e) => messageToLine(e, options.maxToolChars)).join("\n"),
      options.maxSourceChars,
    );
    if (!source.trim()) return null;

    return (async () => {
      const summaryText = await summarize(ctx.provider, source, systemPrompt);
      const summary: AssistantMessage = {
        role: "assistant",
        content: [{ type: "text", text: `Checkpoint summary:\n${summaryText}` }],
      };

      await ctx.store.append(summary, { seq: checkpointSeq, kind: "summary" });
    })();
  };
};
