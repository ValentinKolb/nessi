// ============================================================================
// nessi – Shared Utilities
// ============================================================================

import type { Message, Usage } from "./types.js";

export const zeroUsage = (): Usage => ({ input: 0, output: 0, total: 0 })

export const toErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err)

export const createLoopId = () =>
  globalThis.crypto?.randomUUID?.() ?? `loop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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
 * Truncate oversized tool results in a message list.
 * Returns shallow copies — the store is untouched.
 */
export const truncateToolResults = (messages: Message[], maxChars: number): Message[] =>
  messages.map((msg) => {
    if (msg.role !== "tool_result") return msg;
    const text = stringifyResult(msg.result);
    if (text.length <= maxChars) return msg;
    return { ...msg, result: truncateMiddle(text, maxChars) };
  })

/** Select persisted historical tool results for provider calls outside their originating loop. */
export const projectHistoricalToolResults = (messages: Message[], loopId: string): Message[] =>
  messages.map((message) => {
    if (message.role !== "tool_result" || !message.historicalResult) return message;
    const { historicalResult, ...providerMessage } = message;
    if (historicalResult.originLoopId === loopId) return providerMessage;
    return { ...providerMessage, result: historicalResult.value };
  })
