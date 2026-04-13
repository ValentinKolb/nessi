import { z } from "zod";
import { job } from "@valentinkolb/sync-browser";
import type { StoreEntry } from "nessi-core";
import { listChatMetas, isChatDirty, updateChatMeta, getChatEntryCount } from "../chat-storage.js";
import { readJson } from "../json-storage.js";
import { chatEntriesKey, contentPartsToText } from "../utils.js";
import { createProvider, getActiveProviderEntry } from "../provider.js";
import { formatAll, getMemoryLines, addMemory, removeMemory, replaceMemory } from "../memory.js";
import { getBackgroundPrompt } from "./background-prompt.js";
import { parseBackgroundOutput, applyMemoryOps } from "./parse-background-output.js";
import { log, pushJobLog, syncJobLog, type JobRunLog } from "../scheduler.js";

const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_MESSAGES = 50;

const buildTranscript = (chatId: string): string => {
  const entries = readJson<StoreEntry[]>(chatEntriesKey(chatId), []);
  if (entries.length === 0) return "";

  // Always include first message for context, then last N messages
  const first = entries[0];
  const recent = entries.length > MAX_MESSAGES
    ? entries.slice(-MAX_MESSAGES)
    : entries;

  const toInclude = entries.length > MAX_MESSAGES && first
    ? [first, ...recent.filter((e) => e.seq !== first.seq)]
    : recent;

  const lines: string[] = [];
  for (const entry of toInclude) {
    const message = entry.message;
    if (message.role === "user") {
      const text = contentPartsToText(message.content);
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
};

const processChat = async (
  chatId: string,
  fallbackTitle: string,
  signal: AbortSignal,
): Promise<{ memoryOps: number }> => {
  const providerEntry = getActiveProviderEntry();
  if (!providerEntry) throw new Error("No provider configured");

  const transcript = buildTranscript(chatId);
  if (!transcript) return { memoryOps: 0 };

  const memories = formatAll();
  const promptTemplate = getBackgroundPrompt();
  const systemPrompt = promptTemplate.replaceAll("{{memories}}", memories);

  const provider = createProvider(providerEntry);
  const result = await provider.complete({
    systemPrompt,
    messages: [
      { role: "user", content: [{ type: "text", text: `Conversation:\n${transcript}` }] },
    ],
    maxOutputTokens: 800,
    signal,
  });

  const responseText = result.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  if (!responseText) throw new Error("Empty response from provider");

  const parsed = parseBackgroundOutput(responseText, fallbackTitle);

  // Update chat metadata
  updateChatMeta(chatId, {
    title: parsed.title,
    titleSource: "generated",
    description: parsed.description,
    topics: parsed.topics,
    lastIndexedAt: new Date().toISOString(),
    lastIndexedEntryCount: getChatEntryCount(chatId),
  });

  log(`indexed "${parsed.title}" — ${parsed.topics.length} topics, ${parsed.memoryOps.length} memory ops`);
  if (parsed.description) log(`  description: ${parsed.description.slice(0, 120)}${parsed.description.length > 120 ? "..." : ""}`);
  if (parsed.topics.length > 0) log(`  topics: ${parsed.topics.join(", ")}`);

  // Apply memory operations
  let memoryOpsApplied = 0;
  if (parsed.memoryOps.length > 0) {
    const currentLines = getMemoryLines();
    const { lines, applied, skipped } = applyMemoryOps(currentLines, parsed.memoryOps);

    if (applied > 0) {
      // Write the complete memory file
      const { writeMemories } = await import("../memory.js");
      writeMemories(lines.join("\n"));
      memoryOpsApplied = applied;

      for (const op of parsed.memoryOps) {
        if (op.type === "add") log(`MEMORY_ADD: ${op.text} | ${op.reason}`);
        else if (op.type === "replace") log(`MEMORY_REPLACE ${op.line}: ${op.text} | ${op.reason}`);
        else log(`MEMORY_REMOVE ${op.line}: | ${op.reason}`);
      }
    }
    if (skipped > 0) log(`${skipped} memory ops skipped (invalid line numbers)`);
  }

  return { memoryOps: memoryOpsApplied };
};

/** Run metadata refresh directly (bypasses scheduler queue). */
export const runMetadataRefresh = async (signal?: AbortSignal): Promise<{ processed: number; memoryOps: number; summary: string }> => {
  const providerEntry = getActiveProviderEntry();
  if (!providerEntry) return { processed: 0, memoryOps: 0, summary: "no provider configured" };

  // Find dirty chats, sorted chronologically (oldest first)
  const candidates = listChatMetas()
    .filter((meta) => isChatDirty(meta))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (candidates.length === 0) {
    log("skipped — no dirty chats");
    return { processed: 0, memoryOps: 0, summary: "no dirty chats" };
  }

  log(`running "refresh-metadata" — ${candidates.length} dirty chat${candidates.length > 1 ? "s" : ""}`);

  let processed = 0;
  let totalMemoryOps = 0;

  for (const meta of candidates) {
    if (signal?.aborted) break;

    try {
      const result = await processChat(meta.id, meta.title, signal ?? new AbortController().signal);
      processed++;
      totalMemoryOps += result.memoryOps;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`failed for chat "${meta.title}": ${msg}`);
      // Mark as indexed anyway to prevent infinite retries on malformed chats
      updateChatMeta(meta.id, {
        lastIndexedAt: new Date().toISOString(),
        lastIndexedEntryCount: getChatEntryCount(meta.id),
      });
    }
  }

  const summary = `processed ${processed} chat${processed !== 1 ? "s" : ""}${totalMemoryOps > 0 ? `, ${totalMemoryOps} memory ops` : ""}`;
  log(`done — ${summary}`);
  return { processed, memoryOps: totalMemoryOps, summary };
};

export const refreshMetadataJob = job({
  id: "refresh-metadata",
  schema: z.object({}),
  process: async ({ ctx }) => {
    const entry: JobRunLog = { jobId: "refresh-metadata", startedAt: new Date().toISOString(), status: "running" };
    pushJobLog(entry);
    log("started refresh-metadata");

    try {
      const result = await runMetadataRefresh(ctx.signal);
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = result.summary;
      syncJobLog();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.finishedAt = new Date().toISOString();
      entry.status = "error";
      entry.error = msg;
      syncJobLog();
      log(`refresh-metadata failed: ${msg}`);
      throw err;
    }
  },
});
