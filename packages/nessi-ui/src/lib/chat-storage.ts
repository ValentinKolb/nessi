import { readJson, writeJson } from "./json-storage.js";
import { deleteAllChatFiles } from "./chat-files.js";
import { CHAT_PREFIX } from "./utils.js";

export type ChatMeta = {
  id: string;
  title: string;
  createdAt: string;
  titleSource?: "fallback" | "generated";
  description?: string;
  topics?: string[];
  lastIndexedAt?: string;
  /** Entry count when last background-processed — used for dirty detection. */
  lastIndexedEntryCount?: number;
};

const CHAT_INDEX_KEY = "nessi:chat-index";

/** Build the metadata key for a chat id. */
export const chatMetaKey = (chatId: string) => `${CHAT_PREFIX}${chatId}:meta`;

const emitStorage = (key: string) => {
  window.dispatchEvent(new StorageEvent("storage", { key }));
};

/** List all chat metadata objects sorted by newest first. */
export const listChatMetas = () => {
  let ids = readJson<string[]>(CHAT_INDEX_KEY, []);
  if (!Array.isArray(ids) || ids.length === 0) {
    ids = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .filter((key): key is string => key != null && key.startsWith(CHAT_PREFIX) && key.endsWith(":meta"))
      .map((key) => key.slice(CHAT_PREFIX.length, -":meta".length))
      .filter(Boolean);
    if (ids.length > 0) writeJson(CHAT_INDEX_KEY, [...new Set(ids)]);
  }
  const chats: ChatMeta[] = ids
    .map((id) => readJson<ChatMeta | null>(chatMetaKey(id), null))
    .filter((meta): meta is ChatMeta => Boolean(meta && typeof meta.id === "string" && typeof meta.createdAt === "string"));
  chats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return chats;
};

/** Read metadata for a single chat id. */
export const getChatMeta = (chatId: string): ChatMeta | null =>
  readJson<ChatMeta | null>(chatMetaKey(chatId), null);

/** Remove all persisted records for a given chat id. */
export const deleteChat = (chatId: string) => {
  const prefix = `${CHAT_PREFIX}${chatId}:`;
  const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
    .filter((key): key is string => key != null && key.startsWith(prefix));
  for (const key of keys) localStorage.removeItem(key);
  writeJson(
    CHAT_INDEX_KEY,
    readJson<string[]>(CHAT_INDEX_KEY, []).filter((id) => id !== chatId),
  );
  void deleteAllChatFiles(chatId);
  emitStorage(chatMetaKey(chatId));
};

/** Ensure chat metadata exists and notify listeners once it is created. */
export const ensureChatMeta = (chatId: string, firstMessage: string) => {
  const key = chatMetaKey(chatId);
  if (localStorage.getItem(key)) return;

  const trimmed = firstMessage.trim();
  const titleSource = trimmed || "New chat";
  const title = titleSource.slice(0, 50) + (titleSource.length > 50 ? "..." : "");
  writeJson(key, {
    id: chatId,
    title,
    createdAt: new Date().toISOString(),
    titleSource: "fallback",
  } satisfies ChatMeta);
  const ids = new Set(readJson<string[]>(CHAT_INDEX_KEY, []));
  ids.add(chatId);
  writeJson(CHAT_INDEX_KEY, [...ids]);

  emitStorage(key);
};

export const updateChatTitle = (chatId: string, title: string, titleSource: ChatMeta["titleSource"] = "generated") => {
  const key = chatMetaKey(chatId);
  const current = readJson<ChatMeta | null>(key, null);
  if (!current) return;

  const nextTitle = title.trim();
  if (!nextTitle || (current.title === nextTitle && current.titleSource === titleSource)) return;

  writeJson(key, {
    ...current,
    title: nextTitle,
    titleSource,
  } satisfies ChatMeta);
  emitStorage(key);
};

export const needsGeneratedTitle = (meta: ChatMeta) => meta.titleSource !== "generated";

/** Generic partial update for chat metadata. */
export const updateChatMeta = (
  chatId: string,
  patch: Partial<Pick<ChatMeta, "title" | "titleSource" | "description" | "topics" | "lastIndexedAt" | "lastIndexedEntryCount">>,
) => {
  const key = chatMetaKey(chatId);
  const current = readJson<ChatMeta | null>(key, null);
  if (!current) return;
  writeJson(key, { ...current, ...patch });
  emitStorage(key);
};

const getChatEntries = (chatId: string) =>
  readJson<Array<{ createdAt?: string }>>(`${CHAT_PREFIX}${chatId}:entries`, []);

/** Check if a chat has new messages since its last background processing. */
export const isChatDirty = (meta: ChatMeta): boolean => {
  const entries = getChatEntries(meta.id);
  if (meta.lastIndexedAt === undefined || meta.lastIndexedEntryCount === undefined) return entries.length > 0;

  const latestEntryAt = entries[entries.length - 1]?.createdAt;
  if (entries.length !== meta.lastIndexedEntryCount) return true;
  if (latestEntryAt && latestEntryAt > meta.lastIndexedAt) return true;
  return false;
};

/** Get the current entry count for a chat. */
export const getChatEntryCount = (chatId: string): number =>
  getChatEntries(chatId).length;
