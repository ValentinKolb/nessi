export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs } = api;

  // ── Constants ──────────────────────────────────────────────────────────

  const API_BASE = "https://api.twelvedata.com";
  const STORAGE_KEY = "nessi:twelvedata";

  const RANGE_TO_OUTPUTSIZE = {
    "1d": 1, "5d": 5, "1mo": 22, "3mo": 66, "6mo": 132, "1y": 252, "2y": 504, "5y": 1260,
  };

  const INTERVAL_MAP = { "1day": "1day", "1week": "1week", "1month": "1month", "1d": "1day", "1wk": "1week", "1mo": "1month" };

  // ── API key ────────────────────────────────────────────────────────────

  const getApiKey = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const key = typeof raw?.apiKey === "string" ? raw.apiKey.trim() : "";
      return key || null;
    } catch { return null; }
  };

  // ── Cache (session-only, 60s TTL) ──────────────────────────────────────

  const cache = new Map();
  const CACHE_TTL = 60_000;

  const cached = async (key, fetcher) => {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
    const data = await fetcher();
    cache.set(key, { data, ts: Date.now() });
    return data;
  };

  // ── API helpers ────────────────────────────────────────────────────────

  const apiFetch = async (path) => {
    const apiKey = getApiKey();
    if (!apiKey) throw new Error("Twelve Data API key not configured. Add it in Settings → API Keys → Twelve Data. Get a free key at twelvedata.com.");
    const sep = path.includes("?") ? "&" : "?";
    const url = `${API_BASE}${path}${sep}apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Twelve Data API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    const data = await res.json();
    if (data.status === "error") throw new Error(data.message || "API error");
    return data;
  };

  const fetchQuote = async (symbol) => {
    return cached(`quote:${symbol}`, () => apiFetch(`/quote?symbol=${encodeURIComponent(symbol)}`));
  };

  const fetchTimeSeries = async (symbol, interval, outputsize) => {
    return cached(`ts:${symbol}:${interval}:${outputsize}`, () =>
      apiFetch(`/time_series?symbol=${encodeURIComponent(symbol)}&interval=${interval}&outputsize=${outputsize}`),
    );
  };

  // ── Formatting helpers ─────────────────────────────────────────────────

  const fmt = (n) => {
    const num = typeof n === "string" ? parseFloat(n) : n;
    if (isNaN(num)) return "—";
    if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (Math.abs(num) >= 1e3) return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return num.toFixed(2);
  };

  const fmtChange = (change, pct) => {
    const c = parseFloat(change);
    const p = parseFloat(pct);
    if (isNaN(c) || isNaN(p)) return "—";
    const sign = c >= 0 ? "+" : "";
    return `${sign}${c.toFixed(2)} (${sign}${p.toFixed(2)}%)`;
  };

  const fmtVol = (v) => {
    const num = typeof v === "string" ? parseFloat(v) : v;
    if (isNaN(num)) return "—";
    if (num >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
    return String(num);
  };

  // ── Command ────────────────────────────────────────────────────────────

  return defineCommand("stock", async (args, ctx) => {
    const sub = (args[0] || "").toLowerCase();

    // ── stock history <symbol> --range 1mo --interval 1day --output /output/data.csv
    if (sub === "history") {
      const rest = args.slice(1);
      const symbol = (positionalArgs(rest)[0] || "").toUpperCase();
      if (!symbol) return err("Usage: stock history AAPL --range 1mo --output /output/aapl.csv");

      const opts = parseArgs(rest);
      const range = opts.get("range") || "1mo";
      const outputsize = RANGE_TO_OUTPUTSIZE[range];
      if (!outputsize) return err(`Invalid range: "${range}". Use: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y`);
      const rawInterval = opts.get("interval") || "1day";
      const interval = INTERVAL_MAP[rawInterval];
      if (!interval) return err(`Invalid interval: "${rawInterval}". Use: 1day, 1week, 1month`);
      const outputPath = opts.get("output") || `/output/${symbol.replace("/", "-")}_${range}.csv`;
      if (!outputPath.startsWith("/output/")) return err("Output path must be under /output/.");

      try {
        const data = await fetchTimeSeries(symbol, interval, outputsize);
        if (!data.values || !Array.isArray(data.values)) return err(`No data for ${symbol}.`);

        // values are newest-first, reverse for chronological CSV
        const values = [...data.values].reverse();
        const csvLines = ["date,open,high,low,close,volume"];
        for (const v of values) {
          csvLines.push(`${v.datetime},${v.open},${v.high},${v.low},${v.close},${v.volume}`);
        }

        const dir = outputPath.slice(0, outputPath.lastIndexOf("/")) || "/";
        if (dir !== "/") await ctx.fs.mkdir(dir, { recursive: true });
        await ctx.fs.writeFile(outputPath, csvLines.join("\n"), "utf8");

        return ok([
          `${symbol} — ${values.length} data points (${interval}, ${range})`,
          `Date range: ${values[0]?.datetime} to ${values[values.length - 1]?.datetime}`,
          `Wrote CSV to ${outputPath}`,
          "",
          `Chart it: chart line ${outputPath} --x "date" --y "close" --title "${symbol}"`,
        ].join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Failed to fetch history.");
      }
    }

    // ── stock compare AAPL,MSFT,GOOGL --range 1mo --output /output/compare.csv
    if (sub === "compare") {
      const rest = args.slice(1);
      const symbolsRaw = positionalArgs(rest)[0] || "";
      const symbols = symbolsRaw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
      if (symbols.length < 2) return err("Usage: stock compare AAPL,MSFT,GOOGL --range 1mo --output /output/compare.csv");

      const opts = parseArgs(rest);
      const range = opts.get("range") || "1mo";
      const outputsize = RANGE_TO_OUTPUTSIZE[range];
      if (!outputsize) return err(`Invalid range: "${range}".`);
      const interval = INTERVAL_MAP[opts.get("interval") || "1day"] || "1day";
      const outputPath = opts.get("output") || `/output/${symbols.join("_")}_${range}.csv`;
      if (!outputPath.startsWith("/output/")) return err("Output path must be under /output/.");

      try {
        // Fetch all in parallel
        const results = await Promise.all(symbols.map((s) => fetchTimeSeries(s, interval, outputsize)));

        // Align dates — use the shortest series' dates
        const allSeries = results.map((r, i) => {
          if (!r.values || !Array.isArray(r.values)) throw new Error(`No data for ${symbols[i]}.`);
          const reversed = [...r.values].reverse();
          const map = new Map();
          for (const v of reversed) map.set(v.datetime, parseFloat(v.close));
          return map;
        });

        // Collect dates present in ALL series
        const firstDates = [...allSeries[0].keys()];
        const commonDates = firstDates.filter((d) => allSeries.every((s) => s.has(d)));

        const csvLines = [`date,${symbols.join(",")}`];
        for (const date of commonDates) {
          const values = symbols.map((_, i) => fmt(allSeries[i].get(date)));
          csvLines.push(`${date},${values.join(",")}`);
        }

        const dir = outputPath.slice(0, outputPath.lastIndexOf("/")) || "/";
        if (dir !== "/") await ctx.fs.mkdir(dir, { recursive: true });
        await ctx.fs.writeFile(outputPath, csvLines.join("\n"), "utf8");

        return ok([
          `Compared ${symbols.join(", ")} — ${commonDates.length} data points (${range})`,
          `Wrote CSV to ${outputPath}`,
          "",
          `Chart it: chart line ${outputPath} --x "date" --y "${symbols.join(",")}" --title "${symbols.join(" vs ")}"`,
        ].join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Failed to fetch comparison data.");
      }
    }

    // ── stock --help
    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "stock - Live stock quotes and historical prices",
        "",
        "Usage:",
        "  stock <symbol>                            Current quote",
        "  stock history <symbol> --range 1mo [--interval 1day] [--output /output/data.csv]",
        "  stock compare SYM1,SYM2 --range 1mo [--output /output/compare.csv]",
        "",
        "Ranges: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y",
        "Intervals: 1day (default), 1week, 1month",
        "",
      ].join("\n"));
    }

    // ── stock <symbol> — default: quote
    const symbol = sub.toUpperCase();
    try {
      const q = await fetchQuote(symbol);
      const w52 = q.fifty_two_week || {};
      const lines = [
        `${q.name || symbol} (${q.symbol || symbol})`,
        `Exchange: ${q.exchange || "—"}`,
        `Price: ${fmt(q.close)} ${q.currency || "USD"}`,
        `Change: ${fmtChange(q.change, q.percent_change)}`,
        `Open: ${fmt(q.open)}  High: ${fmt(q.high)}  Low: ${fmt(q.low)}`,
        `Volume: ${fmtVol(q.volume)} (avg: ${fmtVol(q.average_volume)})`,
        `52w: ${fmt(w52.low)} — ${fmt(w52.high)}`,
        `Market: ${q.is_market_open ? "open" : "closed"}`,
      ];
      return ok(lines.join("\n") + "\n");
    } catch (e) {
      return err(e instanceof Error ? e.message : "Failed to fetch quote.");
    }
  });
}
