import type { ScheduleCtx } from "@valentinkolb/sync-browser";
import { createProvider, getActiveProviderEntry } from "../../../lib/provider.js";
import { memoryService } from "../../memory/index.js";
import { localStorageJson } from "../../../shared/storage/local-storage.js";
import { getConsolidationPrompt } from "./background-prompt.js";
import { createLog, pushJobLog, type JobRunLog } from "../scheduler.js";

const log = createLog("consolidate-memory");

const LAST_CONSOLIDATION_KEY = "nessi:last-consolidation";
const CHATS_SINCE_KEY = "nessi:chats-since-consolidation";

const MIN_MEMORY_LINES = 8;
const MIN_HOURS_SINCE_LAST = 4;
const MIN_CHATS_SINCE_LAST = 2;

/** Strip code fences, markdown headers, horizontal rules, and collapse blank-line runs. */
const cleanConsolidationOutput = (raw: string): string =>
  raw
    .replace(/^```\w*\n?/gm, "")
    .replace(/```$/gm, "")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => !/^\s*-{3,}\s*$/.test(line))
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

/** Increment the counter of chats processed since last consolidation. */
export const incrementChatsSinceConsolidation = () => {
  const current = localStorageJson.read<number>(CHATS_SINCE_KEY, 0);
  localStorageJson.write(CHATS_SINCE_KEY, current + 1);
};

const shouldConsolidateAsync = async (): Promise<boolean> => {
  const lines = await memoryService.lines();
  if (lines.length < MIN_MEMORY_LINES) return false;

  const lastConsolidation = localStorageJson.readString(LAST_CONSOLIDATION_KEY);
  if (lastConsolidation) {
    const hoursSince = (Date.now() - new Date(lastConsolidation).getTime()) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_SINCE_LAST) return false;
  }

  const chatsSince = localStorageJson.read<number>(CHATS_SINCE_KEY, 0);
  if (chatsSince < MIN_CHATS_SINCE_LAST) return false;

  return true;
};

const consolidateOnce = async (signal?: AbortSignal): Promise<{ summary: string }> => {
  const providerEntry = getActiveProviderEntry();
  if (!providerEntry) throw new Error("No provider configured");

  const memoryCount = (await memoryService.lines()).length;
  log(`consolidating ${memoryCount} memories...`);

  const memories = await memoryService.formatAll();
  const promptTemplate = await getConsolidationPrompt();
  const systemPrompt = promptTemplate
    .replaceAll("{{memories}}", memories)
    .replaceAll("{{date}}", new Date().toISOString().slice(0, 10));

  const provider = createProvider(providerEntry);
  const result = await provider.complete({
    systemPrompt,
    messages: [
      { role: "user", content: [{ type: "text", text: "Please consolidate the memories above." }] },
    ],
    disableReasoning: true,
    signal,
  });

  const responseText = result.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  if (!responseText) throw new Error("empty response from provider");

  const cleaned = cleanConsolidationOutput(responseText);

  const beforeCount = (await memoryService.lines()).length;
  await memoryService.writeText(cleaned);
  const afterCount = (await memoryService.lines()).length;

  localStorageJson.writeString(LAST_CONSOLIDATION_KEY, new Date().toISOString());
  localStorageJson.write(CHATS_SINCE_KEY, 0);

  return { summary: `${beforeCount} → ${afterCount} memories` };
};

/**
 * Scheduler process — gated by shouldConsolidateAsync on cron ticks so the
 * provider is only called when memory state warrants it. Manual triggers
 * (admin UI Run) bypass the gate and always consolidate.
 */
export const consolidateMemoryProcess = async (
  ctx: ScheduleCtx,
): Promise<{ consolidated: boolean; reason?: string; summary?: string }> => {
  const entry: JobRunLog = { jobId: "consolidate-memory", startedAt: new Date().toISOString(), status: "running" };
  await pushJobLog(entry);

  try {
    if (ctx.trigger !== "manual" && !await shouldConsolidateAsync()) {
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = "skipped (conditions not met)";
      await pushJobLog(entry);
      return { consolidated: false, reason: "conditions-not-met" };
    }

    const { summary } = await consolidateOnce(ctx.signal);
    entry.finishedAt = new Date().toISOString();
    entry.status = "success";
    entry.result = summary;
    await pushJobLog(entry);
    log(`done — ${summary}${ctx.trigger === "manual" ? " (manual)" : ""}`);
    return { consolidated: true, summary };
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

