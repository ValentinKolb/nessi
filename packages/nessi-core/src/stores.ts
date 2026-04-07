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
export function memoryStore(): SessionStore {
  const entries: StoreEntry[] = [];
  let nextSeq = 1;

  function sortEntries() {
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
      let lastSummaryIdx = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i]?.kind === "summary") {
          lastSummaryIdx = i;
          break;
        }
      }
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
