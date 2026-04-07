import type { Message, StoreEntry, SessionStore } from "nessi-core";
import { humanId } from "human-id";
import { ensureChatMeta, type ChatMeta, chatMetaKey } from "./chat-storage.js";
import { readJson, writeJson } from "./json-storage.js";

const STORAGE_PREFIX = "chat:";
export type PersistedStoreEntry = StoreEntry & { createdAt?: string };

export function chatEntriesKey(chatId: string): string {
  return `${STORAGE_PREFIX}${chatId}:entries`;
}

export function loadPersistedEntries(chatId: string): PersistedStoreEntry[] {
  return readJson<PersistedStoreEntry[]>(chatEntriesKey(chatId), []);
}

export function savePersistedEntries(chatId: string, entries: PersistedStoreEntry[]) {
  writeJson(chatEntriesKey(chatId), entries);
}

export function forkPersistedChat(sourceChatId: string, upToSeq: number): string {
  const nextChatId = humanId({ separator: "-", capitalize: false });
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
}

/**
 * SessionStore backed by localStorage. Conversation history persists across page reloads.
 * Same interface as nessi-core's memoryStore but with persistence.
 */
export function localStorageStore(chatId: string): SessionStore {
  let nextSeq = 1;

  function loadRaw(): PersistedStoreEntry[] {
    return loadPersistedEntries(chatId);
  }

  function saveRaw(entries: PersistedStoreEntry[]) {
    savePersistedEntries(chatId, entries);
  }

  // Initialize nextSeq from existing data
  const existing = loadRaw();
  if (existing.length > 0) {
    nextSeq = Math.max(...existing.map((e) => e.seq)) + 1;
  }

  return {
    async load() {
      const entries = loadRaw();
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
}
