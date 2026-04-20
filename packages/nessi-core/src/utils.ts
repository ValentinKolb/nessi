// ============================================================================
// nessi – Shared Utilities
// ============================================================================

import type { Message, Usage } from "./types.js";

export const zeroUsage = (): Usage => ({ input: 0, output: 0, total: 0 })

export const toErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err)

/** Rough token estimate: ~4 chars per token. Slightly overestimates due to JSON syntax — that's safer. */
export const estimateTokens = (messages: Message[]): number =>
  Math.ceil(JSON.stringify(messages).length / 4)

/** Truncate text keeping first half and last half with omission notice. */
export const truncateMiddle = (text: string, maxChars: number): string => {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  const omitted = text.length - 2 * half;
  return `${text.slice(0, half)}\n[... ${omitted} characters omitted ...]\n${text.slice(-half)}`;
}

const stringifyResult = (value: unknown): string => {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); }
  catch { return String(value); }
}

/**
 * Prepare messages for the provider by stripping thinking blocks
 * and truncating oversized tool results. Returns shallow copies — store is untouched.
 */
export const truncateMessages = (messages: Message[], maxToolResultChars?: number): Message[] =>
  messages.map((msg) => {
    // Strip thinking blocks from assistant messages
    if (msg.role === "assistant") {
      const filtered = msg.content.filter((b) => b.type !== "thinking");
      return filtered.length === msg.content.length ? msg : { ...msg, content: filtered };
    }

    // Truncate tool results
    if (msg.role === "tool_result" && typeof maxToolResultChars === "number") {
      const text = stringifyResult(msg.result);
      if (text.length > maxToolResultChars) {
        return { ...msg, result: truncateMiddle(text, maxToolResultChars) };
      }
    }

    return msg;
  })
