import type { ChatMeta, PersistedStoreEntry } from "./chat.types.js";

const isDirty = (meta: ChatMeta, entries: PersistedStoreEntry[]) => {
  if (meta.lastIndexedAt === undefined || meta.lastIndexedEntryCount === undefined) return entries.length > 0;
  const latestEntryAt = entries[entries.length - 1]?.createdAt;
  if (entries.length !== meta.lastIndexedEntryCount) return true;
  if (latestEntryAt && latestEntryAt > meta.lastIndexedAt) return true;
  return false;
};

export const chatDirty = {
  isDirty,
} as const;
