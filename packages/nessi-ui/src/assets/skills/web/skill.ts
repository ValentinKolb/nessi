// @ts-nocheck
export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs } = api;
  const STORAGE_KEY = "nessi:tavily";
  const MAX_EXTRACT_CONTENT = 15000;
  const VALID_TOPICS = ["general", "news", "finance"];

  function getApiKey() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.apiKey === "string" && parsed.apiKey.trim()
        ? parsed.apiKey.trim()
        : null;
    } catch {
      return null;
    }
  }

  function truncateContent(text) {
    if (text.length <= MAX_EXTRACT_CONTENT) return text;
    return text.slice(0, MAX_EXTRACT_CONTENT) + "\n\n... [truncated, " + (text.length - MAX_EXTRACT_CONTENT) + " chars omitted]";
  }

  return cli({ name: "web", description: "Search the internet and read web pages" })
    .sub({
      name: "search",
      usage: "search <query> [--max N] [--topic general|news|finance]",
      async handler(args) {
        const apiKey = getApiKey();
        if (!apiKey) return err("Error: Tavily API key not configured. Please set it in Settings.");

        const query = positionalArgs(args).join(" ");
        if (!query) {
          return err("Error: Please provide a search query.\nUsage: web search <query> [--max N] [--topic general|news|finance]");
        }

        const opts = parseArgs(args);
        const maxResults = Math.min(parseInt(opts.get("max") ?? "5", 10), 10);
        const topic = opts.get("topic") ?? "general";

        if (opts.has("topic") && !VALID_TOPICS.includes(topic)) {
          return err("Error: Invalid topic \"" + topic + "\". Allowed: " + VALID_TOPICS.join(", "));
        }

        try {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: apiKey,
              query,
              max_results: maxResults,
              topic,
              include_answer: "basic",
            }),
          });

          if (!res.ok) {
            const text = await res.text();
            return err("Error: Tavily API returned " + res.status + ": " + text);
          }

          const data = await res.json();
          const lines = [];

          if (data.answer) {
            lines.push("Answer: " + data.answer, "");
          }

          if (Array.isArray(data.results) && data.results.length > 0) {
            lines.push("Results:");
            for (const result of data.results) {
              lines.push("  " + result.title);
              lines.push("  " + result.url);
              if (result.content) lines.push("  " + String(result.content).slice(0, 200));
              lines.push("");
            }
          } else {
            lines.push("No results found.");
          }

          return ok(lines.join("\n"));
        } catch (error) {
          return err("Error: " + (error instanceof Error ? error.message : "Search failed"));
        }
      },
    })
    .sub({
      name: "extract",
      usage: "extract <url> [<url2> ...]",
      async handler(args) {
        const apiKey = getApiKey();
        if (!apiKey) return err("Error: Tavily API key not configured. Please set it in Settings.");

        const urls = args.filter((arg) => !arg.startsWith("--"));
        if (urls.length === 0) return err("Error: Please provide at least one URL.\nUsage: web extract <url> [<url2> ...]");
        if (urls.length > 5) return err("Error: Maximum 5 URLs per request.");

        try {
          const res = await fetch("https://api.tavily.com/extract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: apiKey,
              urls: urls.slice(0, 5),
            }),
          });

          if (!res.ok) {
            const text = await res.text();
            return err("Error: Tavily API returned " + res.status + ": " + text);
          }

          const data = await res.json();
          const lines = [];

          for (const result of data.results ?? []) {
            lines.push("--- " + (result.title ?? result.url) + " ---");
            lines.push(truncateContent(result.raw_content ?? result.content ?? ""));
            lines.push("");
          }

          for (const failed of data.failed_results ?? []) {
            lines.push("Failed: " + failed.url + " — " + failed.error);
          }

          if (lines.length === 0) {
            lines.push("No content extracted.");
          }

          return ok(lines.join("\n"));
        } catch (error) {
          return err("Error: " + (error instanceof Error ? error.message : "Extract failed"));
        }
      },
    });
}
