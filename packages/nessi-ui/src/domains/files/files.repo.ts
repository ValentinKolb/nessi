import { db } from "../../shared/db/db.js";
import { dbEvents } from "../../shared/db/db-events.js";
import type { ChatFileMeta } from "./files.types.js";

const list = async (chatId: string) => {
  await db.init();
  const files = await db.instance.chatFilesMeta.where("chatId").equals(chatId).toArray();
  return files.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) as ChatFileMeta[];
};

const getByPath = async (chatId: string, mountPath: string) => {
  const files = await list(chatId);
  return files.find((file) => file.mountPath === mountPath);
};

const listInput = async (chatId: string) => (await list(chatId)).filter((file) => file.kind === "input");

const listOutput = async (chatId: string) => (await list(chatId)).filter((file) => file.kind === "output");

const putMeta = async (meta: ChatFileMeta) => {
  await db.init();
  await db.instance.chatFilesMeta.put({
    ...meta,
    updatedAt: new Date().toISOString(),
  });
  dbEvents.emit({ scope: "files", id: meta.chatId });
  dbEvents.emit({ scope: `chat:${meta.chatId}`, id: meta.chatId });
};

const removeMeta = async (chatId: string, fileId: string) => {
  await db.init();
  await db.instance.chatFilesMeta.delete(fileId);

  const refs = await db.instance.messageFileRefs.where("chatId").equals(chatId).toArray();
  for (const ref of refs) {
    const nextIds = ref.fileIds.filter((entry) => entry !== fileId);
    if (nextIds.length !== ref.fileIds.length) {
      if (nextIds.length > 0) {
        await db.instance.messageFileRefs.put({ ...ref, fileIds: nextIds });
      } else {
        await db.instance.messageFileRefs.delete(ref.id);
      }
    }
  }

  dbEvents.emit({ scope: "files", id: chatId });
  dbEvents.emit({ scope: `chat:${chatId}`, id: chatId });
};

const removeMissingOutput = async (chatId: string, mountPaths: Set<string>) => {
  const outputs = await listOutput(chatId);
  for (const file of outputs) {
    if (!mountPaths.has(file.mountPath)) await removeMeta(chatId, file.id);
  }
};

const refsForMessage = async (chatId: string, seq: number) => {
  await db.init();
  const ref = await db.instance.messageFileRefs.get(`${chatId}:${seq}`);
  if (!ref) return [];
  const all = await list(chatId);
  const byId = new Map(all.map((file) => [file.id, file] as const));
  return ref.fileIds.map((id) => byId.get(id)).filter((file): file is ChatFileMeta => Boolean(file));
};

const attachToMessage = async (chatId: string, seq: number, fileIds: string[]) => {
  if (fileIds.length === 0) return;
  await db.init();
  await db.instance.messageFileRefs.put({
    id: `${chatId}:${seq}`,
    chatId,
    messageSeq: seq,
    fileIds: [...new Set(fileIds)],
  });
  dbEvents.emit({ scope: "files", id: chatId });
};

const clearRefsAtOrAfter = async (chatId: string, seq: number) => {
  await db.init();
  const refs = await db.instance.messageFileRefs.where("chatId").equals(chatId).toArray();
  const stale = refs.filter((ref) => ref.messageSeq >= seq).map((ref) => ref.id);
  if (stale.length > 0) {
    await db.instance.messageFileRefs.bulkDelete(stale);
    dbEvents.emit({ scope: "files", id: chatId });
  }
};

const clearAllForChat = async (chatId: string) => {
  await db.init();
  const metas = await list(chatId);
  if (metas.length > 0) await db.instance.chatFilesMeta.bulkDelete(metas.map((meta) => meta.id));
  const refs = await db.instance.messageFileRefs.where("chatId").equals(chatId).primaryKeys();
  if (refs.length > 0) await db.instance.messageFileRefs.bulkDelete(refs);
  dbEvents.emit({ scope: "files", id: chatId });
};

export const filesRepo = {
  list,
  getByPath,
  listInput,
  listOutput,
  putMeta,
  removeMeta,
  removeMissingOutput,
  refsForMessage,
  attachToMessage,
  clearRefsAtOrAfter,
  clearAllForChat,
} as const;
