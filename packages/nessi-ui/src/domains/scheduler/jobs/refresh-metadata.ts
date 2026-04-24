import { job, type ScheduleCtx } from "@valentinkolb/sync-browser";
import type { StoreEntry } from "nessi-core";
import { chatRepo } from "../../chat/index.js";
import { contentPartsToText } from "../../../lib/utils.js";
import { createProvider, getActiveProviderEntry } from "../../../lib/provider.js";
import { memoryService } from "../../memory/index.js";
import { getBackgroundPrompt } from "./background-prompt.js";
import { parseBackgroundOutput, applyMemoryOps } from "./parse-background-output.js";
import { createLog, pushJobLog, type JobRunLog } from "../scheduler.js";

const log = createLog("refresh-metadata");
const chatLog = createLog("process-chat");
import { loadPersistedEntries } from "../../../lib/store.js";

const MAX_TRANSCRIPT_CHARS = 4000;
const MAX_MESSAGES = 50;

const buildTranscript = async (chatId: string): Promise<string> => {
  const entries = await loadPersistedEntries(chatId) as StoreEntry[];
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

/** Fallback summary for chats with no text content — no LLM call needed. */
const writeFallbackSummary = async (chatId: string, fallbackTitle: string, entryCount: number) => {
  await chatRepo.updateMeta(chatId, {
    title: fallbackTitle,
    titleSource: "fallback",
    description: `Chat with ${entryCount} entr${entryCount === 1 ? "y" : "ies"} — no text content for automatic summary.`,
    topics: [],
    lastIndexedAt: new Date().toISOString(),
    lastIndexedEntryCount: entryCount,
    summaryNextRetryAt: undefined,
  });
};

const processChat = async (
  chatId: string,
  fallbackTitle: string,
  signal: AbortSignal,
): Promise<{ memoryOps: number }> => {
  const providerEntry = getActiveProviderEntry();
  if (!providerEntry) throw new Error("No provider configured");

  const transcript = await buildTranscript(chatId);
  if (!transcript) {
    // Chat has no text content (files/images only, or empty messages). Write a
    // local fallback summary so the chat has a description and stops re-queueing.
    // New user text later will grow entry count and trigger a real summary.
    const entryCount = await chatRepo.getEntryCount(chatId);
    await writeFallbackSummary(chatId, fallbackTitle, entryCount);
    chatLog(`fallback summary written for "${fallbackTitle}" — ${entryCount} entries, no text`);
    return { memoryOps: 0 };
  }

  const memories = await memoryService.formatAll();
  const promptTemplate = await getBackgroundPrompt();
  const systemPrompt = promptTemplate
    .replaceAll("{{memories}}", memories)
    .replaceAll("{{date}}", new Date().toISOString().slice(0, 10));

  const provider = createProvider(providerEntry);
  const result = await provider.complete({
    systemPrompt,
    messages: [
      { role: "user", content: [{ type: "text", text: `Conversation:\n${transcript}` }] },
    ],
    disableReasoning: true,
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
  await chatRepo.updateMeta(chatId, {
    title: parsed.title,
    titleSource: "generated",
    description: parsed.description,
    topics: parsed.topics,
    lastIndexedAt: new Date().toISOString(),
    lastIndexedEntryCount: await chatRepo.getEntryCount(chatId),
    summaryNextRetryAt: undefined,
  });

  chatLog(`indexed "${parsed.title}" — ${parsed.topics.length} topics, ${parsed.memoryOps.length} memory ops`);
  if (parsed.description) chatLog(`  description: ${parsed.description.slice(0, 120)}${parsed.description.length > 120 ? "..." : ""}`);
  if (parsed.topics.length > 0) chatLog(`  topics: ${parsed.topics.join(", ")}`);

  // Apply memory operations
  let memoryOpsApplied = 0;
  if (parsed.memoryOps.length > 0) {
    const currentLines = await memoryService.lines();
    const { lines, applied, skipped } = applyMemoryOps(currentLines, parsed.memoryOps);

    if (applied > 0) {
      await memoryService.writeText(lines.join("\n"));
      memoryOpsApplied = applied;

      for (const op of parsed.memoryOps) {
        if (op.type === "add") chatLog(`MEMORY_ADD: ${op.text} | ${op.reason}`);
        else if (op.type === "replace") chatLog(`MEMORY_REPLACE ${op.line}: ${op.text} | ${op.reason}`);
        else chatLog(`MEMORY_REMOVE ${op.line}: | ${op.reason}`);
      }
    }
    if (skipped > 0) chatLog(`${skipped} memory ops skipped (invalid line numbers)`);
  }

  return { memoryOps: memoryOpsApplied };
};

/**
 * Per-chat processing job — submitted from the refresh-metadata scheduler.
 * Keyed by chat id so submits dedupe while a chat is in-flight.
 *
 * Retry semantics (driven by manualTrigger from the scheduler's ctx.trigger):
 * - Manual (admin UI Run button): one-shot. Error is logged; user can click again.
 * - Cron: 2 attempts with a short backoff between; after that, summaryNextRetryAt
 *   is set to now + 6h so the chat leaves the dirty pool until the pause expires.
 */
export const processChatJob = job<{ chatId: string; fallbackTitle: string; manualTrigger?: boolean }>({
  id: "process-chat",
  process: async ({ ctx }) => {
    const chatLogEntry: JobRunLog = {
      jobId: `process-chat:${ctx.input.chatId}`,
      startedAt: new Date().toISOString(),
      status: "running",
    };
    await pushJobLog(chatLogEntry);
    try {
      const result = await processChat(ctx.input.chatId, ctx.input.fallbackTitle, ctx.signal);
      chatLogEntry.finishedAt = new Date().toISOString();
      chatLogEntry.status = "success";
      chatLogEntry.result = result.memoryOps > 0 ? `${result.memoryOps} memory ops` : "indexed";
      await pushJobLog(chatLogEntry);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      chatLogEntry.finishedAt = new Date().toISOString();
      chatLogEntry.status = "error";
      chatLogEntry.error = msg;
      await pushJobLog(chatLogEntry);
      throw err;
    }
  },
  after: async ({ ctx }) => {
    if (!ctx.error) return;

    // Manual trigger: one-shot. Do not reschedule, do not set a pause — the
    // user sees the error in the log and can click Run again.
    if (ctx.input.manualTrigger) {
      chatLog(`manual-trigger error for "${ctx.input.chatId}" — not retrying`);
      return;
    }

    // Cron path: 2 attempts, then 6h pause.
    if (ctx.failureCount < 1) {
      const delayMs = ctx.expBackoff({ baseMs: 60_000, maxMs: 60_000 });
      chatLog(`retry scheduled for "${ctx.input.chatId}" in ${Math.round(delayMs / 1000)}s (attempt 2)`);
      ctx.reschedule({ delayMs });
      return;
    }
    try {
      await chatRepo.updateMeta(ctx.input.chatId, {
        summaryNextRetryAt: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
      });
      chatLog(`giving up on "${ctx.input.chatId}" after 2 attempts — paused for 6h`);
    } catch (pauseErr) {
      const msg = pauseErr instanceof Error ? pauseErr.message : String(pauseErr);
      chatLog(`pause-after-giveup failed for "${ctx.input.chatId}": ${msg}`);
    }
  },
});

/**
 * Scheduler process — fans out one processChatJob per dirty chat.
 * Runs fast; actual work happens in each job with independent retry state.
 * The per-chat job learns whether the trigger was manual via submit input.
 */
export const refreshMetadataProcess = async (ctx: ScheduleCtx): Promise<{ submitted: number; summary: string }> => {
  const entry: JobRunLog = { jobId: "refresh-metadata", startedAt: new Date().toISOString(), status: "running" };
  await pushJobLog(entry);

  try {
    const providerEntry = getActiveProviderEntry();
    if (!providerEntry) {
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = "no provider configured";
      await pushJobLog(entry);
      return { submitted: 0, summary: entry.result };
    }

    const metas = await chatRepo.listMetas();
    const candidates: typeof metas = [];
    for (const meta of metas) {
      if (await chatRepo.isChatDirty(meta)) candidates.push(meta);
    }
    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    if (candidates.length === 0) {
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = "no dirty chats";
      await pushJobLog(entry);
      return { submitted: 0, summary: entry.result };
    }

    const manualTrigger = ctx.trigger === "manual";
    for (const meta of candidates) {
      await processChatJob.submit({
        key: `chat:${meta.id}`,
        input: { chatId: meta.id, fallbackTitle: meta.title, manualTrigger },
      });
    }

    entry.finishedAt = new Date().toISOString();
    entry.status = "success";
    entry.result = `submitted ${candidates.length} chat${candidates.length > 1 ? "s" : ""}${manualTrigger ? " (manual)" : ""}`;
    await pushJobLog(entry);
    log(entry.result);
    return { submitted: candidates.length, summary: entry.result };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    entry.finishedAt = new Date().toISOString();
    entry.status = "error";
    entry.error = msg;
    await pushJobLog(entry);
    log(`failed: ${msg}`);
    throw err;
  }
};
