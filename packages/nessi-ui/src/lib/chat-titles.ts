import type { ContentPart, StoreEntry } from "nessi-core";
import { createProvider, getActiveProviderEntry } from "./provider.js";
import { chatMetaKey, listChatMetas, needsGeneratedTitle, type ChatMeta, updateChatTitle } from "./chat-storage.js";
import { readJson } from "./json-storage.js";

const CHAT_PREFIX = "chat:";
const MAX_CHATS_PER_PASS = 5;
const MAX_TRANSCRIPT_CHARS = 1800;

let running = false;

function entriesKey(chatId: string): string {
  return `${CHAT_PREFIX}${chatId}:entries`;
}

function textFromUserContent(content: ContentPart[]): string {
  return content
    .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
    .join(" ")
    .trim();
}

function buildTranscript(chatId: string): string {
  const entries = readJson<StoreEntry[]>(entriesKey(chatId), []);
  const lines: string[] = [];

  for (const entry of entries) {
    const message = entry.message;
    if (message.role === "user") {
      const text = textFromUserContent(message.content);
      if (text) lines.push(`User: ${text}`);
      continue;
    }
    if (message.role !== "assistant") continue;

    const text = message.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim();
    if (text) lines.push(`Assistant: ${text}`);
  }

  return lines.join("\n").slice(0, MAX_TRANSCRIPT_CHARS);
}

function cleanTitle(raw: string, fallback: string): string {
  const compact = raw
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .split("\n")[0]
    ?.trim() ?? "";

  if (!compact) return fallback;
  return compact.slice(0, 48);
}

async function generateTitle(meta: ChatMeta): Promise<void> {
  const providerEntry = getActiveProviderEntry();
  if (!providerEntry) return;

  const transcript = buildTranscript(meta.id);
  if (!transcript) return;

  const provider = createProvider(providerEntry);
  const result = await provider.complete({
    systemPrompt: "Create a concise chat title. Return only the title, 2 to 5 words, no markdown, no quotes.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Conversation transcript:\n${transcript}`,
          },
        ],
      },
    ],
    maxOutputTokens: 20,
  });

  const titleText = result.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  const fallback = meta.title.trim() || "New chat";
  updateChatTitle(meta.id, cleanTitle(titleText, fallback), "generated");
}

export async function refreshChatTitlesInBackground(limit = MAX_CHATS_PER_PASS): Promise<void> {
  if (running) return;
  running = true;

  try {
    const candidates = listChatMetas()
      .filter(needsGeneratedTitle)
      .slice(0, limit);

    for (const meta of candidates) {
      try {
        await generateTitle(meta);
      } catch {
        // Ignore per-chat title failures; keep the fallback title.
      }
    }
  } finally {
    running = false;
  }
}
