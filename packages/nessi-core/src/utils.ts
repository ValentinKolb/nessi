// ============================================================================
// nessi – Shared Utilities
// ============================================================================

import type { Usage } from "./types.js";

export const zeroUsage = (): Usage => ({ input: 0, output: 0, total: 0 })

export const toErrorMessage = (err: unknown) =>
  err instanceof Error ? err.message : String(err)
