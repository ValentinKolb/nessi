import { deleteAllChatFiles } from "./chat-files.js";
import { chatRepo, type ChatMeta } from "../domains/chat/index.js";

export type { ChatMeta } from "../domains/chat/index.js";

export const listChatMetas = () => chatRepo.listMetas();
export const getChatMeta = (chatId: string) => chatRepo.getMeta(chatId);
export const deleteChat = async (chatId: string) => {
  await chatRepo.deleteChat(chatId);
  await deleteAllChatFiles(chatId);
};
export const ensureChatMeta = (chatId: string, firstMessage: string) => chatRepo.ensureMeta(chatId, firstMessage);
export const updateChatMeta = (chatId: string, patch: Partial<Pick<ChatMeta, "title" | "titleSource" | "description" | "topics" | "lastIndexedAt" | "lastIndexedEntryCount">>) =>
  chatRepo.updateMeta(chatId, patch);
export const isChatDirty = (meta: ChatMeta) => chatRepo.isChatDirty(meta);
export const getChatEntryCount = (chatId: string) => chatRepo.getEntryCount(chatId);
