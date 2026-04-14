import type { Message, SessionStore } from "nessi-core";
import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import { newId } from "../../lib/utils.js";
import { chatDirty } from "./chat-dirty.js";
import type { ChatMeta, PersistedStoreEntry } from "./chat.types.js";

const loadEntries = async (chatId: string) => {
  await db.init();
  const entries = await db.instance.chatEntries.where("chatId").equals(chatId).toArray();
  return entries
    .map((entry) => ({
      seq: entry.seq,
      kind: entry.kind,
      message: entry.message,
      createdAt: entry.createdAt,
    }))
    .sort((a, b) => {
      if (a.seq !== b.seq) return a.seq - b.seq;
      if (a.kind === "summary" && b.kind === "message") return 1;
      if (a.kind === "message" && b.kind === "summary") return -1;
      return 0;
    }) satisfies PersistedStoreEntry[];
};

const saveEntries = async (chatId: string, entries: PersistedStoreEntry[]) => {
  await db.init();
  await db.instance.transaction("rw", db.instance.chatEntries, db.instance.chats, async () => {
    const ids = await db.instance.chatEntries.where("chatId").equals(chatId).primaryKeys();
    if (ids.length > 0) await db.instance.chatEntries.bulkDelete(ids);

    if (entries.length > 0) {
      await db.instance.chatEntries.bulkPut(entries.map((entry) => ({
        id: `${chatId}:${entry.seq}:${entry.kind}`,
        chatId,
        seq: entry.seq,
        kind: entry.kind,
        message: entry.message,
        createdAt: entry.createdAt,
      })));
    }

    const meta = await db.instance.chats.get(chatId);
    if (meta) {
      await db.instance.chats.put({
        ...meta,
        updatedAt: entries[entries.length - 1]?.createdAt ?? meta.updatedAt ?? meta.createdAt,
      });
    }
  });

  dbEvents.emit({ scope: "chats", id: chatId });
  dbEvents.emit({ scope: `chat:${chatId}`, id: chatId });
};

const truncateEntries = async (chatId: string, beforeSeq: number) => {
  const entries = (await loadEntries(chatId)).filter((entry) => entry.seq < beforeSeq);
  await saveEntries(chatId, entries);
};

const listMetas = async () => {
  await db.init();
  const chats = await db.instance.chats.orderBy("createdAt").reverse().toArray();
  return chats.map((chat) => ({ ...chat })) satisfies ChatMeta[];
};

const getMeta = async (chatId: string) => {
  await db.init();
  const meta = await db.instance.chats.get(chatId);
  return meta ? ({ ...meta } satisfies ChatMeta) : null;
};

const ensureMeta = async (chatId: string, firstMessage: string) => {
  await db.init();
  const existing = await db.instance.chats.get(chatId);
  if (existing) return;

  const trimmed = firstMessage.trim();
  const titleSource = trimmed || "New chat";
  const title = titleSource.slice(0, 50) + (titleSource.length > 50 ? "..." : "");
  const now = new Date().toISOString();
  await db.instance.chats.put({
    id: chatId,
    title,
    createdAt: now,
    updatedAt: now,
    titleSource: "fallback",
  });

  dbEvents.emit({ scope: "chats", id: chatId });
  dbEvents.emit({ scope: `chat:${chatId}`, id: chatId });
};

const updateMeta = async (
  chatId: string,
  patch: Partial<Pick<ChatMeta, "title" | "titleSource" | "description" | "topics" | "lastIndexedAt" | "lastIndexedEntryCount">>,
) => {
  await db.init();
  const current = await db.instance.chats.get(chatId);
  if (!current) return;
  await db.instance.chats.put({
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  });
  dbEvents.emit({ scope: "chats", id: chatId });
  dbEvents.emit({ scope: `chat:${chatId}`, id: chatId });
};

const updateTitle = async (chatId: string, title: string, titleSource: ChatMeta["titleSource"] = "generated") => {
  const nextTitle = title.trim();
  if (!nextTitle) return;
  await updateMeta(chatId, { title: nextTitle, titleSource });
};

const deleteChat = async (chatId: string) => {
  await db.init();
  await db.instance.transaction("rw", db.instance.chats, db.instance.chatEntries, async () => {
    await db.instance.chats.delete(chatId);
    const entryIds = await db.instance.chatEntries.where("chatId").equals(chatId).primaryKeys();
    if (entryIds.length > 0) await db.instance.chatEntries.bulkDelete(entryIds);
  });
  dbEvents.emit({ scope: "chats", id: chatId });
  dbEvents.emit({ scope: `chat:${chatId}`, id: chatId });
};

const getEntryCount = async (chatId: string) => (await loadEntries(chatId)).length;

const isChatDirty = async (meta: ChatMeta) => chatDirty.isDirty(meta, await loadEntries(meta.id));

const needsGeneratedTitle = (meta: ChatMeta) => meta.titleSource !== "generated";

const forkChat = async (sourceChatId: string, upToSeq: number) => {
  const nextChatId = newId();
  const sourceEntries = (await loadEntries(sourceChatId))
    .filter((entry) => entry.seq <= upToSeq)
    .map((entry) => ({ ...entry }));

  await saveEntries(nextChatId, sourceEntries);

  const firstUser = sourceEntries.find((entry) => entry.message.role === "user");
  if (firstUser?.message.role === "user") {
    const firstText = firstUser.message.content
      .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
      .join(" ")
      .trim();
    await ensureMeta(nextChatId, firstText ? `${firstText} fork` : "Fork");
  } else {
    await ensureMeta(nextChatId, "Fork");
  }

  const meta = await getMeta(nextChatId);
  if (meta) {
    await updateMeta(nextChatId, {
      title: meta.title.endsWith("fork") ? meta.title : `${meta.title} fork`,
      titleSource: "fallback",
    });
  }

  return nextChatId;
};

const createStore = (chatId: string): SessionStore => {
  let nextSeq = 1;
  let loaded = false;

  const ensureLoaded = async () => {
    if (loaded) return;
    const existing = await loadEntries(chatId);
    if (existing.length > 0) nextSeq = Math.max(...existing.map((entry) => entry.seq)) + 1;
    loaded = true;
  };

  return {
    async load() {
      await ensureLoaded();
      const entries = await loadEntries(chatId);
      const lastSummaryIndex = entries.findLastIndex((entry) => entry.kind === "summary");
      return lastSummaryIndex >= 0 ? entries.slice(lastSummaryIndex) : [...entries];
    },

    async append(message: Message, opts?: { seq?: number; kind?: "message" | "summary" }) {
      await ensureLoaded();
      const entries = await loadEntries(chatId);
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
      await saveEntries(chatId, entries);
    },
  };
};

export const chatRepo = {
  loadEntries,
  saveEntries,
  truncateEntries,
  listMetas,
  getMeta,
  ensureMeta,
  updateMeta,
  updateTitle,
  deleteChat,
  getEntryCount,
  isChatDirty,
  needsGeneratedTitle,
  forkChat,
  createStore,
} as const;
