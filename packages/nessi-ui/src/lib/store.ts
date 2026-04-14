import type { ContentPart, Message, StoreEntry, SessionStore } from "nessi-core";
import { chatRepo, type ChatMeta, type PersistedStoreEntry } from "../domains/chat/index.js";

export type { PersistedStoreEntry } from "../domains/chat/index.js";

export const loadPersistedEntries = (chatId: string) => chatRepo.loadEntries(chatId);
export const truncatePersistedEntries = (chatId: string, beforeSeq: number) => chatRepo.truncateEntries(chatId, beforeSeq);

const imageOmittedText = (imageCount: number): ContentPart => ({
  type: "text",
  text: imageCount === 1
    ? "User attached an earlier image. The raw image is omitted from follow-up context."
    : `User attached ${imageCount} earlier images. The raw images are omitted from follow-up context.`,
});

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

export const persistentSessionStore = (chatId: string): SessionStore => chatRepo.createStore(chatId);
