import { z } from "zod";
import { job } from "@valentinkolb/sync-browser";
import { createProvider, getActiveProviderEntry } from "../../../lib/provider.js";
import { memoryService } from "../../memory/index.js";
import { chatRepo } from "../../chat/index.js";
import { localStorageJson } from "../../../shared/storage/local-storage.js";
import { getSuggestionPrompt } from "./background-prompt.js";
import { log, pushJobLog, type JobRunLog } from "../scheduler.js";

const resolvePrompt = (template: string, memories: string, recentChats: string) =>
  template
    .replaceAll("{{memories}}", memories)
    .replaceAll("{{recent_chats}}", recentChats)
    .replaceAll("{{date}}", new Date().toISOString().slice(0, 10));

const SUGGESTIONS_KEY = "nessi:chat-suggestions";
const LAST_RUN_KEY = "nessi:suggestions-last-run";
const MIN_HOURS_BETWEEN_RUNS = 3;
const MAX_RECENT_CHATS = 8;

type ContentBlock = { type: string; text?: string; thinking?: string };

/** Extract usable response text, falling back to the last line of thinking blocks when no text blocks exist. */
const extractResponseText = (blocks: readonly ContentBlock[]): string => {
  const textOut = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join(" ")
    .trim();
  if (textOut) return textOut;

  const thinkingTails = blocks
    .filter((b) => b.type === "thinking" && typeof b.thinking === "string")
    .map((b) => {
      const lines = (b.thinking as string).split("\n").map((l) => l.trim()).filter(Boolean);
      return lines[lines.length - 1] ?? "";
    })
    .filter(Boolean);
  return thinkingTails.join("\n").trim();
};

/** Diagnostic string: "blocks: thinking×2, text×0" — for error reporting when response is empty. */
const describeBlocks = (blocks: readonly ContentBlock[]): string => {
  const counts: Record<string, number> = {};
  for (const b of blocks) counts[b.type] = (counts[b.type] ?? 0) + 1;
  const parts = Object.entries(counts).map(([type, n]) => `${type}×${n}`);
  return `blocks: ${parts.length > 0 ? parts.join(", ") : "none"}`;
};

export const getSuggestions = (): string[] =>
  localStorageJson.read<string[]>(SUGGESTIONS_KEY, []);

const buildRecentChatsContext = async (): Promise<string> => {
  const metas = await chatRepo.listMetas();
  const recent = metas
    .filter((m) => m.description || (m.topics && m.topics.length > 0))
    .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
    .slice(0, MAX_RECENT_CHATS);

  if (recent.length === 0) return "No recent conversations.";

  return recent.map((m) => {
    const parts: string[] = [`- "${m.title}"`];
    if (m.description) parts.push(`  ${m.description.slice(0, 200)}`);
    if (m.topics && m.topics.length > 0) parts.push(`  Topics: ${m.topics.join(", ")}`);
    return parts.join("\n");
  }).join("\n");
};

const shouldRun = (): boolean => {
  const lastRun = localStorageJson.readString(LAST_RUN_KEY);
  if (!lastRun) return true;
  const hoursSince = (Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60);
  return hoursSince >= MIN_HOURS_BETWEEN_RUNS;
};

export const suggestTopicsJob = job({
  id: "suggest-topics",
  schema: z.object({}),
  process: async ({ ctx }) => {
    const entry: JobRunLog = { jobId: "suggest-topics", startedAt: new Date().toISOString(), status: "running" };
    await pushJobLog(entry);
    log("started suggest-topics");

    try {
      if (!shouldRun()) {
        entry.finishedAt = new Date().toISOString();
        entry.status = "success";
        entry.result = "skipped (too recent)";
        await pushJobLog(entry);
        log("suggest-topics skipped (too recent)");
        return { generated: false, reason: "too-recent" };
      }

      const providerEntry = getActiveProviderEntry();
      if (!providerEntry) {
        entry.finishedAt = new Date().toISOString();
        entry.status = "success";
        entry.result = "skipped (no provider)";
        await pushJobLog(entry);
        return { generated: false, reason: "no-provider" };
      }

      const memories = await memoryService.formatForPrompt();
      const recentChats = await buildRecentChatsContext();
      const promptTemplate = await getSuggestionPrompt();
      const systemPrompt = resolvePrompt(promptTemplate, memories, recentChats);

      const provider = createProvider(providerEntry);
      const result = await provider.complete({
        systemPrompt,
        messages: [
          { role: "user", content: [{ type: "text", text: "Generate conversation starters." }] },
        ],
        maxOutputTokens: 800,
        signal: ctx.signal,
      });

      const responseText = extractResponseText(result.message.content as ContentBlock[]);

      if (!responseText) {
        const diag = `empty response (${describeBlocks(result.message.content as ContentBlock[])})`;
        entry.finishedAt = new Date().toISOString();
        entry.status = "error";
        entry.error = diag;
        await pushJobLog(entry);
        log(`suggest-topics failed: ${diag}`);
        return { generated: false, reason: "empty-response" };
      }

      const suggestions = responseText
        .split("\n")
        .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter((line) => line.length > 5 && line.length < 120)
        .slice(0, 6);

      localStorageJson.write(SUGGESTIONS_KEY, suggestions);
      localStorageJson.writeString(LAST_RUN_KEY, new Date().toISOString());

      const summary = `${suggestions.length} suggestions generated`;
      entry.finishedAt = new Date().toISOString();
      entry.status = "success";
      entry.result = summary;
      await pushJobLog(entry);
      log(`suggest-topics done — ${summary}`);
      return { generated: true, count: suggestions.length, suggestions };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      entry.finishedAt = new Date().toISOString();
      entry.status = "error";
      entry.error = msg;
      await pushJobLog(entry);
      log(`suggest-topics failed: ${msg}`);
      throw err;
    }
  },
});

/** Run suggestion generation directly, bypassing scheduler guards. */
export const runSuggestTopics = async (): Promise<{ generated: boolean; reason?: string; summary?: string }> => {
  const providerEntry = getActiveProviderEntry();
  if (!providerEntry) return { generated: false, reason: "no provider" };

  log("suggest-topics (manual)...");

  const memories = await memoryService.formatForPrompt();
  const recentChats = await buildRecentChatsContext();
  const promptTemplate = await getSuggestionPrompt();
  const systemPrompt = resolvePrompt(promptTemplate, memories, recentChats);

  const provider = createProvider(providerEntry);
  const result = await provider.complete({
    systemPrompt,
    messages: [
      { role: "user", content: [{ type: "text", text: "Generate conversation starters." }] },
    ],
    maxOutputTokens: 800,
  });

  const responseText = extractResponseText(result.message.content as ContentBlock[]);

  if (!responseText) {
    const diag = `empty response (${describeBlocks(result.message.content as ContentBlock[])})`;
    return { generated: false, reason: diag };
  }

  const suggestions = responseText
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length > 5 && line.length < 120)
    .slice(0, 6);

  localStorageJson.write(SUGGESTIONS_KEY, suggestions);
  localStorageJson.writeString(LAST_RUN_KEY, new Date().toISOString());

  const summary = `${suggestions.length} suggestions generated`;
  log(`suggest-topics done (manual) — ${summary}`);
  return { generated: true, summary };
};
