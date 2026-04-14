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
};

export type PersistedStoreEntry = StoreEntry & { createdAt?: string };
