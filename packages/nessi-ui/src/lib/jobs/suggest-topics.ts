import { z } from "zod";
import { job } from "@valentinkolb/sync-browser";
import { createProvider, getActiveProviderEntry } from "../provider.js";
import { formatForPrompt } from "../memory.js";
import { listChatMetas } from "../chat-storage.js";
import { readJson, writeJson, readString, writeString } from "../json-storage.js";
import { getSuggestionPrompt } from "./background-prompt.js";
import { log, pushJobLog, type JobRunLog } from "../scheduler.js";

const resolvePrompt = (template: string, memories: string, recentChats: string) =>
  template
    .replaceAll("{{memories}}", memories)
    .replaceAll("{{recent_chats}}", recentChats);

const SUGGESTIONS_KEY = "nessi:chat-suggestions";
const LAST_RUN_KEY = "nessi:suggestions-last-run";
const MIN_HOURS_BETWEEN_RUNS = 3;
const MAX_RECENT_CHATS = 8;

export const getSuggestions = (): string[] =>
  readJson<string[]>(SUGGESTIONS_KEY, []);

const buildRecentChatsContext = async (): Promise<string> => {
  const metas = await listChatMetas();
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
  const lastRun = readString(LAST_RUN_KEY);
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

      const memories = await formatForPrompt();
      const recentChats = await buildRecentChatsContext();
      const promptTemplate = await getSuggestionPrompt();
      const systemPrompt = resolvePrompt(promptTemplate, memories, recentChats);

      const provider = createProvider(providerEntry);
      const result = await provider.complete({
        systemPrompt,
        messages: [
          { role: "user", content: [{ type: "text", text: "Generate conversation starters." }] },
        ],
        maxOutputTokens: 400,
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
        await pushJobLog(entry);
        return { generated: false, reason: "empty-response" };
      }

      const suggestions = responseText
        .split("\n")
        .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
        .filter((line) => line.length > 5 && line.length < 120)
        .slice(0, 6);

      writeJson(SUGGESTIONS_KEY, suggestions);
      writeString(LAST_RUN_KEY, new Date().toISOString());

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

  const memories = await formatForPrompt();
  const recentChats = await buildRecentChatsContext();
  const promptTemplate = await getSuggestionPrompt();
  const systemPrompt = resolvePrompt(promptTemplate, memories, recentChats);

  const provider = createProvider(providerEntry);
  const result = await provider.complete({
    systemPrompt,
    messages: [
      { role: "user", content: [{ type: "text", text: "Generate conversation starters." }] },
    ],
    maxOutputTokens: 400,
  });

  const responseText = result.message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();

  if (!responseText) return { generated: false, reason: "empty response" };

  const suggestions = responseText
    .split("\n")
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line.length > 5 && line.length < 120)
    .slice(0, 6);

  writeJson(SUGGESTIONS_KEY, suggestions);
  writeString(LAST_RUN_KEY, new Date().toISOString());

  const summary = `${suggestions.length} suggestions generated`;
  log(`suggest-topics done (manual) — ${summary}`);
  return { generated: true, summary };
};
