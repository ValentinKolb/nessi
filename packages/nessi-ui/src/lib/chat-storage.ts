import { readJson, writeJson } from "./json-storage.js";

export interface ChatMeta {
  id: string;
  title: string;
  createdAt: string;
  titleSource?: "fallback" | "generated";
}

const CHAT_PREFIX = "chat:";
const CHAT_INDEX_KEY = "nessi:chat-index";

/** Build the metadata key for a chat id. */
export function chatMetaKey(chatId: string): string {
  return `${CHAT_PREFIX}${chatId}:meta`;
}

function emitStorage(key: string): void {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

/** List all chat metadata objects sorted by newest first. */
export function listChatMetas(): ChatMeta[] {
  let ids = readJson<string[]>(CHAT_INDEX_KEY, []);
  if (!Array.isArray(ids) || ids.length === 0) {
    ids = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(CHAT_PREFIX) || !key.endsWith(":meta")) continue;
      const chatId = key.slice(CHAT_PREFIX.length, -":meta".length);
      if (chatId) ids.push(chatId);
    }
    if (ids.length > 0) writeJson(CHAT_INDEX_KEY, [...new Set(ids)]);
  }
  const chats: ChatMeta[] = ids
    .map((id) => readJson<ChatMeta | null>(chatMetaKey(id), null))
    .filter((meta): meta is ChatMeta => Boolean(meta && typeof meta.id === "string" && typeof meta.createdAt === "string"));
  chats.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return chats;
}

/** Remove all persisted records for a given chat id. */
export function deleteChat(chatId: string): void {
  const prefix = `${CHAT_PREFIX}${chatId}:`;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
  writeJson(
    CHAT_INDEX_KEY,
    readJson<string[]>(CHAT_INDEX_KEY, []).filter((id) => id !== chatId),
  );
  emitStorage(chatMetaKey(chatId));
}

/** Ensure chat metadata exists and notify listeners once it is created. */
export function ensureChatMeta(chatId: string, firstMessage: string): void {
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
}

export function updateChatTitle(chatId: string, title: string, titleSource: ChatMeta["titleSource"] = "generated"): void {
  const key = chatMetaKey(chatId);
  const current = readJson<ChatMeta | null>(key, null);
  if (!current) return;

  const nextTitle = title.trim();
  if (!nextTitle || current.title === nextTitle && current.titleSource === titleSource) return;

  writeJson(key, {
    ...current,
    title: nextTitle,
    titleSource,
  } satisfies ChatMeta);
  emitStorage(key);
}

export function needsGeneratedTitle(meta: ChatMeta): boolean {
  return meta.titleSource !== "generated";
}
