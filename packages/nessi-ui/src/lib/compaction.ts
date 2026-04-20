import { truncateMiddle } from "nessi-core";
import type { AssistantMessage, CompactFn, Message, Provider, StoreEntry, Usage } from "nessi-core";
import { contentPartsToText } from "./utils.js";

const MAX_TOOL_CHARS = 300;
const MAX_SOURCE_CHARS = 24_000;
const FILL_RATIO_THRESHOLD = 0.75;
const MIN_KEEP_LOOPS = 2;

const DEFAULT_SYSTEM_PROMPT = "You write concise checkpoint summaries for agent memory compaction.";

export type DefaultCompactionOptions = {
  maxToolChars?: number;
  maxSourceChars?: number;
  fillRatioThreshold?: number;
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

// ---------------------------------------------------------------------------
// Entry -> text for summarization
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
// Split logic — always splits at user-message boundaries (whole loops)
// ---------------------------------------------------------------------------

/**
 * Find the split index so that the recent portion contains approximately
 * `keepLoops` conversation loops (user messages).
 * Splitting at user-message boundaries guarantees no orphaned tool_results.
 */
const findLoopSplitIndex = (entries: StoreEntry[], keepLoops: number) => {
  let loopsSeen = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i]!.kind === "message" && entries[i]!.message.role === "user") {
      loopsSeen++;
      if (loopsSeen === keepLoops) {
        return i > 0 ? i : -1;
      }
    }
  }
  return -1;
};

/** Count conversation loops. Each loop starts with a user message. */
const countLoops = (entries: StoreEntry[]) =>
  entries.reduce((total, entry) => total + (
    entry.kind === "message" && entry.message.role === "user" ? 1 : 0
  ), 0);

/**
 * Derive how many recent loops to keep based on fill ratio.
 * Higher fill ratio -> keep fewer loops -> more aggressive compaction.
 */
const keepLoopsForFillRatio = (fillRatio: number, totalLoops: number): number => {
  // Keep at most half the loops, scaled down by fill ratio
  const target = Math.round(totalLoops * Math.max(0.2, 1 - fillRatio));
  return Math.max(MIN_KEEP_LOOPS, target);
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Build the default compaction strategy used by UI sessions. */
export const createDefaultCompactFn = (rawOptions: DefaultCompactionOptions = {}): CompactFn => {
  const maxToolChars = rawOptions.maxToolChars ?? MAX_TOOL_CHARS;
  const maxSourceChars = rawOptions.maxSourceChars ?? MAX_SOURCE_CHARS;
  const threshold = rawOptions.fillRatioThreshold ?? FILL_RATIO_THRESHOLD;
  const systemPrompt = rawOptions.compactionPrompt || DEFAULT_SYSTEM_PROMPT;

  return (ctx) => {
    const { entries, force, fillRatio } = ctx;

    // Manual /compact (force=true) always runs — never skip
    if (!force) {
      // Auto-compaction: only trigger based on fill ratio
      if (typeof fillRatio !== "number" || fillRatio < threshold) return null;
    }

    const totalLoops = countLoops(entries);
    if (totalLoops <= MIN_KEEP_LOOPS) return null;

    // Determine how many loops to keep
    const keepLoops = typeof fillRatio === "number"
      ? keepLoopsForFillRatio(fillRatio, totalLoops)
      : MIN_KEEP_LOOPS;

    const splitIndex = findLoopSplitIndex(entries, keepLoops);
    if (splitIndex < 1) return null;
    const olderEntries = entries.slice(0, splitIndex);
    if (olderEntries.length === 0) return null;

    const checkpointSeq = olderEntries[olderEntries.length - 1]?.seq;
    if (typeof checkpointSeq !== "number") return null;

    const source = trimSource(
      olderEntries.map((e) => messageToLine(e, maxToolChars)).join("\n"),
      maxSourceChars,
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
