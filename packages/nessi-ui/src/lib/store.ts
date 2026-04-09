import type { ContentPart, Message, StoreEntry, SessionStore } from "nessi-core";
import { ensureChatMeta, type ChatMeta, chatMetaKey } from "./chat-storage.js";
import { readJson, writeJson } from "./json-storage.js";
import { chatEntriesKey, CHAT_PREFIX, newId } from "./utils.js";

export { chatEntriesKey } from "./utils.js";

export type PersistedStoreEntry = StoreEntry & { createdAt?: string };

export const loadPersistedEntries = (chatId: string) =>
  readJson<PersistedStoreEntry[]>(chatEntriesKey(chatId), []);

export const savePersistedEntries = (chatId: string, entries: PersistedStoreEntry[]) => {
  writeJson(chatEntriesKey(chatId), entries);
};

export const truncatePersistedEntries = (chatId: string, beforeSeq: number) => {
  const entries = loadPersistedEntries(chatId).filter((entry) => entry.seq < beforeSeq);
  savePersistedEntries(chatId, entries);
};

const imageOmittedText = (imageCount: number): ContentPart => ({
  type: "text",
  text: imageCount === 1
    ? "User attached an earlier image. The raw image is omitted from follow-up context."
    : `User attached ${imageCount} earlier images. The raw images are omitted from follow-up context.`,
});

/**
 * Strip raw image parts from older user messages before they are sent back to multimodal providers.
 * This keeps the UI history intact while avoiding repeated image replay on every new user turn.
 */
export const stripHistoricalImages = (entries: StoreEntry[], preserveImagesAfterSeq: number) =>
  entries.map((entry) => {
    if (entry.seq > preserveImagesAfterSeq || entry.message.role !== "user") return entry;

    const imageCount = entry.message.content.filter(
      (part) => typeof part !== "string" && part.type === "file",
    ).length;

    if (imageCount === 0) return entry;

    const content = entry.message.content.filter(
      (part) => typeof part === "string" || part.type !== "file",
    );

    const nextContent = content.length > 0 ? [...content, imageOmittedText(imageCount)] : [imageOmittedText(imageCount)];
    return {
      ...entry,
      message: {
        ...entry.message,
        content: nextContent,
      },
    };
  });

export const createProviderContextStore = (store: SessionStore, preserveImagesAfterSeq: number): SessionStore => ({
  async load() {
    return stripHistoricalImages(await store.load(), preserveImagesAfterSeq);
  },
  append: store.append,
});

export const forkPersistedChat = (sourceChatId: string, upToSeq: number) => {
  const nextChatId = newId();
  const sourceEntries = loadPersistedEntries(sourceChatId)
    .filter((entry) => entry.seq <= upToSeq)
    .map((entry) => ({ ...entry }));

  savePersistedEntries(nextChatId, sourceEntries);

  const firstUser = sourceEntries.find((entry) => entry.message.role === "user");
  if (firstUser?.message.role === "user") {
    const firstText = firstUser.message.content
      .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
      .join(" ")
      .trim();
    ensureChatMeta(nextChatId, firstText ? `${firstText} fork` : "Fork");
  } else {
    ensureChatMeta(nextChatId, "Fork");
  }

  const meta = readJson<ChatMeta | null>(chatMetaKey(nextChatId), null);
  if (meta) {
    writeJson(chatMetaKey(nextChatId), {
      ...meta,
      title: meta.title.endsWith("fork") ? meta.title : `${meta.title} fork`,
      titleSource: "fallback",
    } satisfies ChatMeta);
  }

  return nextChatId;
};

/**
 * SessionStore backed by localStorage. Conversation history persists across page reloads.
 * Same interface as nessi-core's memoryStore but with persistence.
 */
export const localStorageStore = (chatId: string): SessionStore => {
  let nextSeq = 1;

  const loadRaw = () => loadPersistedEntries(chatId);

  const saveRaw = (entries: PersistedStoreEntry[]) => {
    savePersistedEntries(chatId, entries);
  };

  // Initialize nextSeq from existing data
  const existing = loadRaw();
  if (existing.length > 0) {
    nextSeq = Math.max(...existing.map((e) => e.seq)) + 1;
  }

  return {
    async load() {
      const entries = loadRaw();
      const lastSummaryIdx = entries.findLastIndex((e) => e.kind === "summary");
      return lastSummaryIdx >= 0 ? entries.slice(lastSummaryIdx) : [...entries];
    },

    async append(message: Message, opts?: { seq?: number; kind?: "message" | "summary" }) {
      const entries = loadRaw();
      const seq = opts?.seq ?? nextSeq++;
      const kind = opts?.kind ?? "message";
      entries.push({ seq, kind, message, createdAt: new Date().toISOString() });
      entries.sort((a, b) => {
        if (a.seq !== b.seq) return a.seq - b.seq;
        if (a.kind === "summary" && b.kind === "message") return 1;
        if (a.kind === "message" && b.kind === "summary") return -1;
        return 0;
      });
      nextSeq = Math.max(nextSeq, seq + 1);
      saveRaw(entries);
    },
  };
};
