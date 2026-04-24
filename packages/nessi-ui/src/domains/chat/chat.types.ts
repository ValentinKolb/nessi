import type { StoreEntry } from "nessi-core";

export type ChatMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt?: string;
  titleSource?: "fallback" | "generated";
  description?: string;
  topics?: string[];
  lastIndexedAt?: string;
  lastIndexedEntryCount?: number;
  /**
   * ISO timestamp — when set and in the future, chats with a missing description
   * are not re-flagged as dirty (back-off after repeated indexing failures).
   * Cleared implicitly on success when the job writes a non-empty description.
   */
  summaryNextRetryAt?: string;
};

export type PersistedStoreEntry = StoreEntry & { createdAt?: string };
