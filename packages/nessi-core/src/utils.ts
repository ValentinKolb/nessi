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
