/**
 * Rebuild UI messages from persisted nessi-core StoreEntry format.
 * Pure function — no side effects, no signals, no component state.
 */

import { humanId } from "human-id";
import type { StoreEntry } from "nessi-core";
import type { UIMessage, UIBlock, UIAssistantMessage } from "../components/chat/types.js";
import { contentPartsToUIContent } from "./chat-content.js";
import { fileMetasForMessage } from "./chat-files.js";
import { loadPersistedEntries } from "./store.js";
import { inlineToolHandlers } from "./inline-tool-blocks.js";

const msgId = () => humanId({ separator: "-", capitalize: false });

const compactPreview = (text: string, max = 1200) =>
  text.length <= max ? text : `${text.slice(0, max)}...`;

const summaryTextFromEntry = (entry: StoreEntry): string | undefined => {
  const message = entry.message;
  if (message.role === "assistant") {
    const text = message.content
      .filter((block): block is Extract<typeof message.content[number], { type: "text" }> => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return text || undefined;
  }
  if (message.role === "user") {
    const text = message.content
      .map((part) => (typeof part === "string" ? part : part.type === "text" ? part.text : ""))
      .join("\n")
      .trim();
    return text || undefined;
  }
  return undefined;
};

export { summaryTextFromEntry, compactPreview };

export const loadMessages = async (chatId: string): Promise<UIMessage[]> => {
  const entries = await loadPersistedEntries(chatId);

  const toolResults = new Map<string, { result: unknown; isError?: boolean }>();
  for (const entry of entries) {
    if (entry.kind === "summary") continue;
    const message = entry.message;
    if (message.role === "tool_result" && message.callId) {
      toolResults.set(message.callId, { result: message.result, isError: message.isError });
    }
  }

  const messages: UIMessage[] = [];
  let lastUserTimestamp: string | undefined;
  for (const entry of entries) {
    if (entry.kind === "summary") {
      const summaryText = summaryTextFromEntry(entry);
      if (summaryText) {
        messages.push({
          id: msgId(),
          role: "assistant",
          blocks: [{
            type: "compaction",
            title: "Checkpoint summary",
            message: "Older history was condensed into a checkpoint summary.",
            sessionName: "main",
            applied: true,
            reason: "stop",
            summaryPreview: compactPreview(summaryText),
          }],
          meta: {
            entrySeq: entry.seq,
            timestamp: entry.createdAt,
          },
        });
      }
      continue;
    }
    const message = entry.message;

    if (message.role === "user") {
      const fileParts = (await fileMetasForMessage(chatId, entry.seq)).map((file) => ({
        type: "file" as const,
        fileId: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      }));
      messages.push({
        id: msgId(),
        role: "user",
        content: [...contentPartsToUIContent(message.content), ...fileParts],
        timestamp: entry.createdAt,
        entrySeq: entry.seq,
      });
      lastUserTimestamp = entry.createdAt;
      continue;
    }

    if (message.role !== "assistant") continue;
    const content = message.content as Array<{
      type: string;
      text?: string;
      thinking?: string;
      name?: string;
      args?: unknown;
      id?: string;
    }>;

    const blocks: UIBlock[] = [];
    for (const block of content) {
      if (block.type === "text" && block.text?.trim()) {
        blocks.push({ type: "text", text: block.text });
      } else if (block.type === "thinking" && block.thinking) {
        blocks.push({ type: "thinking", text: block.thinking });
      } else if (block.type === "tool_call" && block.id && block.name) {
        const result = toolResults.get(block.id);
        const args = (block.args ?? {}) as Record<string, unknown>;

        blocks.push({
          type: "tool_call",
          callId: block.id,
          name: block.name,
          args,
          result: result?.result,
          isError: result?.isError,
        });

        const handler = inlineToolHandlers[block.name];
        const fromArgsBlock = handler?.fromArgs?.(args, block.id) ?? null;
        if (fromArgsBlock) blocks.push(fromArgsBlock);

        if (result !== undefined && !result.isError) {
          const produced = handler?.fromResult?.(result.result, args, block.id) ?? null;
          if (produced) {
            if ("type" in produced && typeof produced.type === "string") {
              blocks.push(produced as UIBlock);
            } else if (fromArgsBlock) {
              const last = blocks[blocks.length - 1];
              if (last && last === fromArgsBlock) {
                blocks[blocks.length - 1] = { ...fromArgsBlock, ...(produced as Partial<UIBlock>) } as UIBlock;
              }
            }
          }
        }
      }
    }

    const durationMs = lastUserTimestamp && entry.createdAt
      ? Math.max(0, new Date(entry.createdAt).getTime() - new Date(lastUserTimestamp).getTime())
      : undefined;

    // Merge consecutive assistant entries into a single UI message (matches live behavior)
    const prev = messages[messages.length - 1];
    if (prev && prev.role === "assistant") {
      (prev as UIAssistantMessage).blocks.push(...blocks);
      const meta = (prev as UIAssistantMessage).meta;
      if (meta) {
        meta.entrySeq = entry.seq;
        meta.timestamp = entry.createdAt;
        meta.model = message.model ?? meta.model;
        meta.usage = message.usage ?? meta.usage;
        meta.stopReason = message.stopReason ?? meta.stopReason;
        if (durationMs !== undefined) meta.durationMs = durationMs;
      }
    } else {
      messages.push({
        id: msgId(),
        role: "assistant",
        blocks,
        meta: {
          entrySeq: entry.seq,
          timestamp: entry.createdAt,
          startedAt: lastUserTimestamp,
          model: message.model,
          usage: message.usage,
          stopReason: message.stopReason,
          durationMs,
        },
      });
    }
  }

  return messages;
};
