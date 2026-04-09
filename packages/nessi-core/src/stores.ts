// ============================================================================
// nessi – Session Stores
// ============================================================================

import type { Message, StoreEntry, SessionStore } from "./types.js";

/**
 * In-memory SessionStore. For tests, prototyping, single-use sessions.
 *
 * Messages are never deleted. Summaries are inserted via append() with
 * `{ kind: "summary" }`. load() returns entries from the last summary onward.
 *
 * Tiebreaker: at the same seq, "summary" sorts after "message" so that
 * the summary replaces (not precedes) messages at that position.
 */
export const memoryStore = (): SessionStore => {
  const entries: StoreEntry[] = [];
  let nextSeq = 1;

  const sortEntries = () => {
    entries.sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      // summary after message at same seq
      if (a.kind === "summary" && b.kind === "message") return 1;
      if (a.kind === "message" && b.kind === "summary") return -1;
      return 0;
    });
  }

  return {
    async load() {
      const lastSummaryIdx = entries.findLastIndex(e => e.kind === "summary");
      return lastSummaryIdx >= 0 ? entries.slice(lastSummaryIdx) : [...entries];
    },

    async append(message: Message, opts?: { seq?: number; kind?: "message" | "summary" }) {
      const seq = opts?.seq ?? nextSeq++;
      const kind = opts?.kind ?? "message";
      entries.push({ seq, kind, message });
      sortEntries();
      // Ensure nextSeq stays ahead
      nextSeq = Math.max(nextSeq, seq + 1);
    },
  };
}
