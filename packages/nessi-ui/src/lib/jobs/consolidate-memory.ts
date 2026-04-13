import { z } from "zod";
import { job } from "@valentinkolb/sync-browser";
import { createProvider, getActiveProviderEntry } from "../provider.js";
import { formatAll, getMemoryLines, writeMemories } from "../memory.js";
import { readJson, readString, writeJson, writeString } from "../json-storage.js";
import { getConsolidationPrompt } from "./background-prompt.js";
import { log, pushJobLog, syncJobLog, type JobRunLog } from "../scheduler.js";

const LAST_CONSOLIDATION_KEY = "nessi:last-consolidation";
const CHATS_SINCE_KEY = "nessi:chats-since-consolidation";

const MIN_MEMORY_LINES = 25;
const MIN_HOURS_SINCE_LAST = 24;
const MIN_CHATS_SINCE_LAST = 3;

/** Increment the counter of chats processed since last consolidation. */
export const incrementChatsSinceConsolidation = () => {
  const current = readJson<number>(CHATS_SINCE_KEY, 0);
  writeJson(CHATS_SINCE_KEY, current + 1);
};

const shouldConsolidate = (): boolean => {
  const lines = getMemoryLines();
  if (lines.length < MIN_MEMORY_LINES) return false;

  const lastConsolidation = readString(LAST_CONSOLIDATION_KEY);
  if (lastConsolidation) {
    const hoursSince = (Date.now() - new Date(lastConsolidation).getTime()) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_SINCE_LAST) return false;
  }

  const chatsSince = readJson<number>(CHATS_SINCE_KEY, 0);
  if (chatsSince < MIN_CHATS_SINCE_LAST) return false;

  return true;
};

export const consolidateMemoryJob = job({
  id: "consolidate-memory",
  schema: z.object({}),
  process: async ({ ctx }) => {
    const entry: JobRunLog = { jobId: "consolidate-memory", startedAt: new Date().toISOString(), status: "running" };
    pushJobLog(entry);
    log("started consolidate-memory");

    try {
      if (!shouldConsolidate()) {
        entry.finishedAt = new Date().toISOString();
        entry.status = "success";
        entry.result = "skipped (conditions not met)";
        syncJobLog();
        log("consolidate-memory skipped (conditions not met)");
        return { consolidated: false, reason: "conditions-not-met" };
      }

      const providerEntry = getActiveProviderEntry();
      if (!providerEntry) {
        entry.finishedAt = new Date().toISOString();
        entry.status = "success";
        entry.result = "skipped (no provider)";
        syncJobLog();
        return { consolidated: false, reason: "no-provider" };
      }

      const memoryCount = getMemoryLines().length;
      log(`consolidating ${memoryCount} memories...`);

      const memories = formatAll();
      const promptTemplate = getConsolidationPrompt();
      const systemPrompt = promptTemplate.replaceAll("{{memories}}", memories);

      const provider = createProvider(providerEntry);
      const result = await provider.complete({
        systemPrompt,
        messages: [
          { role: "user", content: [{ type: "text", text: "Please consolidate the memories above." }] },
        ],
        maxOutputTokens: 1500,
        signal: ctx.signal,
      });

      const responseText = result.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();

      if (!responseText) {
        entry.finishedAt = new Date().toISOString();
        entry.status = "error";
        entry.error = "empty response";
        syncJobLog();
        log("consolidate-memory failed: empty response");
        return { consolidated: false, reason: "empty-response" };
      }

      const cleaned = responseText
        .replace(/^```\w*\n?/gm, "")
        .replace(/```$/gm, "")
        .trim();

      const beforeCount = getMemoryLines().length;
      writeMemories(cleaned);
      const afterCount = getMemoryLines().length;

      writeString(LAST_CONSOLIDATION_KEY, new Date().toISOString());
      writeJson(CHATS_SINCE_KEY, 0);

      const summary = `${beforeCount} → ${afterCount} memories`;
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = summary;
      syncJobLog();
      log(`consolidate-memory done — ${summary}`);
      return { consolidated: true, before: beforeCount, after: afterCount, summary };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.finishedAt = new Date().toISOString();
      entry.status = "error";
      entry.error = msg;
      syncJobLog();
      log(`consolidate-memory failed: ${msg}`);
      throw err;
    }
  },
});
