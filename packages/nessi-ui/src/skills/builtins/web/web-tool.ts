import { z } from "zod";
import { defineTool } from "nessi-core";
import { readJson } from "../../../lib/json-storage.js";
import { truncateText } from "../../../lib/utils.js";

const STORAGE_KEY = "nessi:tavily";
const MAX_EXTRACT_CONTENT = 15_000;
const VALID_TOPICS = ["general", "news", "finance"] as const;

const getApiKey = () => {
  try {
    const raw = readJson<{ apiKey?: string } | null>(STORAGE_KEY, null);
    return typeof raw?.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : null;
  } catch {
    return null;
  }
};

/** Accept urls as: array, JSON-encoded string, or single URL string. */
const coerceUrlArray = z.union([
  z.array(z.string().url()),
  z.string().transform((s, ctx) => {
    // Try JSON parse first: "[\"https://...\"]"
    const trimmed = s.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.every((v: unknown) => typeof v === "string")) return parsed as string[];
      } catch { /* fall through */ }
    }
    // Single URL
    if (/^https?:\/\//i.test(trimmed)) return [trimmed];
    ctx.addIssue({ code: "custom", message: "Expected a URL or array of URLs" });
    return [];
  }),
]).pipe(z.array(z.string().url()).min(1).max(5));

const webInputSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("search"),
    query: z.string().describe("Search query. Example: 'latest Bun release notes'"),
    maxResults: z.coerce.number().int().positive().max(10).optional().describe(
      "Optional number of results, 1 to 10. Example: 5",
    ),
    topic: z.enum(VALID_TOPICS).optional().describe(
      "Optional search topic. Use 'news' for current events. Example: 'general'",
    ),
  }),
  z.object({
    action: z.literal("extract"),
    urls: coerceUrlArray.describe(
      "One to five absolute URLs to read. Example: ['https://example.com/article']",
    ),
  }),
]);

const webOutputSchema = z.object({
  result: z.string(),
});

export const webTool = defineTool({
  name: "web",
  description:
    "Search the web and read pages. Use this whenever you need current information, when the user shares a URL, or when a fact may have changed recently. Example search input: {\"action\":\"search\",\"query\":\"latest Bun release notes\",\"maxResults\":5}. Example extract input: {\"action\":\"extract\",\"urls\":[\"https://example.com/article\"]}.",
  inputSchema: webInputSchema,
  outputSchema: webOutputSchema,
}).server(async (input) => {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { result: "Error: Tavily API key not configured. The user needs to add their Tavily API key in Settings → API Keys → Tavily. They can get one at tavily.com." };
  }

  if (input.action === "search") {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          query: input.query,
          max_results: input.maxResults ?? 5,
          topic: input.topic ?? "general",
          include_answer: "basic",
        }),
      });

      if (!res.ok) {
        return { result: `Error: Tavily API returned ${res.status}: ${await res.text()}` };
      }

      const data = await res.json() as {
        answer?: string;
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };

      const lines: string[] = [];
      if (data.answer) lines.push(`Answer: ${data.answer}`, "");

      if (Array.isArray(data.results) && data.results.length > 0) {
        lines.push("Results:");
        for (const result of data.results) {
          lines.push(`- ${result.title ?? "Untitled"}`);
          if (result.url) lines.push(`  ${result.url}`);
          if (result.content) lines.push(`  ${String(result.content).slice(0, 200)}`);
          lines.push("");
        }
      } else {
        lines.push("No results found.");
      }

      return { result: lines.join("\n").trim() };
    } catch (error) {
      return { result: `Error: ${error instanceof Error ? error.message : "Search failed"}` };
    }
  }

  try {
    const res = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        urls: input.urls,
      }),
    });

    if (!res.ok) {
      return { result: `Error: Tavily API returned ${res.status}: ${await res.text()}` };
    }

    const data = await res.json() as {
      results?: Array<{ title?: string; url?: string; raw_content?: string; content?: string }>;
      failed_results?: Array<{ url?: string; error?: string }>;
    };

    const lines: string[] = [];
    for (const result of data.results ?? []) {
      lines.push(`--- ${result.title ?? result.url ?? "Page"} ---`);
      lines.push(truncateText(result.raw_content ?? result.content ?? "", MAX_EXTRACT_CONTENT, "content"));
      lines.push("");
    }

    for (const failed of data.failed_results ?? []) {
      lines.push(`Failed: ${failed.url ?? "unknown"} -- ${failed.error ?? "unknown error"}`);
    }

    if (lines.length === 0) {
      lines.push("No content extracted.");
    }

    return { result: lines.join("\n").trim() };
  } catch (error) {
    return { result: `Error: ${error instanceof Error ? error.message : "Extract failed"}` };
  }
});
