export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs } = api;

  const cache = new Map();
  const cached = async (key, fetcher) => {
    const e = cache.get(key);
    if (e && Date.now() - e.ts < 600_000) return e.data; // 10 min TTL
    const data = await fetcher();
    cache.set(key, { data, ts: Date.now() });
    return data;
  };

  const wikiApi = (lang) => `https://${lang}.wikipedia.org/api/rest_v1`;

  const fetchSummary = async (title, lang) => {
    return cached(`summary:${lang}:${title}`, async () => {
      const res = await fetch(`${wikiApi(lang)}/page/summary/${encodeURIComponent(title)}`);
      if (res.status === 404) throw new Error(`Article not found: "${title}". Try a different search term or language.`);
      if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
      return res.json();
    });
  };

  const searchArticles = async (query, lang) => {
    return cached(`search:${lang}:${query}`, async () => {
      const res = await fetch(`${wikiApi(lang)}/page/related/${encodeURIComponent(query)}`);
      if (!res.ok) {
        // Fallback to action API search
        const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=8&format=json&origin=*`;
        const res2 = await fetch(searchUrl);
        if (!res2.ok) throw new Error(`Wikipedia search failed: ${res2.status}`);
        const [, titles] = await res2.json();
        return titles || [];
      }
      const data = await res.json();
      return (data.pages || []).map((p) => p.title);
    });
  };

  return defineCommand("wiki", async (args) => {
    const sub = (args[0] || "").toLowerCase();

    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "wiki - Wikipedia lookups",
        "",
        '  wiki "topic"                   Article summary',
        '  wiki search "query"            Find articles',
        "  wiki ... --lang de             Use other language Wikipedia",
        "",
      ].join("\n"));
    }

    const opts = parseArgs(args);
    const lang = opts.get("lang") || "en";

    // ── wiki search "query"
    if (sub === "search") {
      const query = args.slice(1).filter((a) => !a.startsWith("--")).join(" ");
      if (!query) return err('Usage: wiki search "query"');
      try {
        const titles = await searchArticles(query, lang);
        if (titles.length === 0) return ok("No articles found.\n");
        return ok(`Results for "${query}":\n${titles.map((t) => `- ${t}`).join("\n")}\n`);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Search failed.");
      }
    }

    // ── wiki "topic" — default: summary
    const topic = args.filter((a) => !a.startsWith("--")).join(" ");
    if (!topic) return err('Usage: wiki "topic"');

    try {
      let data;
      try {
        data = await fetchSummary(topic, lang);
      } catch {
        // If direct lookup fails, try search + first result
        const titles = await searchArticles(topic, lang);
        if (titles.length === 0) throw new Error(`No Wikipedia article found for "${topic}".`);
        data = await fetchSummary(titles[0], lang);
      }

      const lines = [
        `${data.title}`,
        data.description ? `(${data.description})` : "",
        "",
        data.extract || "No summary available.",
        "",
        `Source: ${data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(data.title)}`}`,
      ].filter(Boolean);

      return ok(lines.join("\n") + "\n");
    } catch (e) {
      return err(e instanceof Error ? e.message : "Wikipedia lookup failed.");
    }
  });
}
