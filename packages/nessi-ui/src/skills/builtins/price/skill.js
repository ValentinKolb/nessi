export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs } = api;

  // ── Constants ──────────────────────────────────────────────────────────

  const GOLD_API = "https://api.gold-api.com";
  const FRANKFURTER_API = "https://api.frankfurter.dev/v1";
  const TROY_OZ_GRAMS = 31.1035;

  const UNIT_TO_GRAMS = { g: 1, kg: 1000, oz: TROY_OZ_GRAMS, dwt: 1.55517 };

  const PURITY_MAP = {
    "8k": 0.333, "333": 0.333,
    "9k": 0.375, "375": 0.375,
    "10k": 0.417, "417": 0.417,
    "14k": 0.585, "585": 0.585,
    "18k": 0.750, "750": 0.750,
    "21k": 0.875, "875": 0.875,
    "900": 0.900,
    "22k": 0.916, "916": 0.916,
    "24k": 0.999, "999": 0.999,
  };

  const ASSET_ALIASES = {
    gold: "XAU", silver: "XAG", platinum: "XPT", palladium: "XPD",
    copper: "HG", bitcoin: "BTC", ethereum: "ETH",
    xau: "XAU", xag: "XAG", xpt: "XPT", xpd: "XPD",
    hg: "HG", btc: "BTC", eth: "ETH",
  };

  // ── Cache (session-only, 60s TTL per API recommendation) ──────────────

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

  const fetchPrice = async (symbol, currency) => {
    const cur = currency.toUpperCase();
    const url = `${GOLD_API}/price/${symbol}/${cur}`;
    return cached(`price:${symbol}:${cur}`, async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Gold API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      const data = await res.json();
      if (typeof data.price !== "number") throw new Error(`No price data for ${symbol}. Check the symbol with: price list`);
      return data;
    });
  };

  const fetchSymbols = async () => {
    return cached("symbols", async () => {
      const res = await fetch(`${GOLD_API}/symbols`);
      if (!res.ok) throw new Error(`Gold API ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("Unexpected API response.");
      return data;
    });
  };

  const fetchCurrencyRate = async (from, to, amount) => {
    const url = `${FRANKFURTER_API}/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
    return cached(`fx:${from}:${to}:${amount}`, async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Currency API ${res.status}: ${await res.text().catch(() => res.statusText)}`);
      return res.json();
    });
  };

  // ── Parsing helpers ────────────────────────────────────────────────────

  const resolveSymbol = (name) => {
    const key = (name || "").toLowerCase().trim();
    return ASSET_ALIASES[key] || key.toUpperCase();
  };

  const parsePurity = (raw) => {
    if (!raw) return null;
    const key = raw.toLowerCase().trim();
    if (PURITY_MAP[key] !== undefined) return PURITY_MAP[key];
    const num = parseFloat(key);
    if (isNaN(num)) throw new Error(`Unknown purity: "${raw}". Use a stamp (333, 585, 750, 999) or karat (8K, 14K, 18K, 24K).`);
    const normalized = num <= 1 ? num : num / 1000;
    if (normalized <= 0 || normalized > 1) throw new Error(`Purity out of range: "${raw}". Must be between 1 and 999 (or 0.001 and 1.0).`);
    return normalized;
  };

  const parseUnit = (raw) => {
    if (!raw) return "g";
    const key = raw.toLowerCase().trim();
    if (UNIT_TO_GRAMS[key] !== undefined) return key;
    throw new Error(`Unknown unit: "${raw}". Use: g, kg, oz (troy ounce), dwt (pennyweight).`);
  };

  const fmt = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const purityLabel = (purity) => {
    const karat = Math.round(purity * 24);
    const stamp = Math.round(purity * 1000);
    return `${stamp}/1000 = ${karat}K`;
  };

  // ── Command ────────────────────────────────────────────────────────────

  return defineCommand("price", async (args) => {
    const sub = (args[0] || "").toLowerCase();

    // ── price list ─────────────────────────────────────────────────────
    if (sub === "list") {
      try {
        const symbols = await fetchSymbols();
        const lines = symbols.map((s) => `${s.name || "?"} (${s.symbol || "?"})`);
        return ok("Available assets:\n" + lines.join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Failed to fetch symbols.");
      }
    }

    // ── price convert <amount> --from USD --to EUR ──────────────────────
    if (sub === "convert") {
      const rest = args.slice(1);
      const rawAmount = positionalArgs(rest)[0];
      if (rawAmount === undefined) return err("Usage: price convert 100 --from USD --to EUR");
      const amount = parseFloat(rawAmount);
      if (isNaN(amount)) return err(`Invalid amount: "${rawAmount}".`);
      const opts = parseArgs(rest);
      const from = opts.get("from");
      const to = opts.get("to");
      if (!from || !to) return err("Both --from and --to are required.");
      try {
        const data = await fetchCurrencyRate(from, to, amount);
        const target = to.toUpperCase();
        const converted = (data.rates || {})[target];
        if (converted === undefined) return err(`No rate found for ${target}.`);
        const rate = amount !== 0 ? converted / amount : 0;
        return ok(`${fmt(amount)} ${from.toUpperCase()} = ${fmt(converted)} ${target}\nRate: ${rate.toFixed(4)}\n`);
      } catch (e) {
        return err(e instanceof Error ? e.message : "Currency conversion failed.");
      }
    }

    // ── price value <asset> --weight 23 --purity 750 --currency EUR ────
    if (sub === "value") {
      const rest = args.slice(1);
      const assetName = positionalArgs(rest)[0];
      if (!assetName) return err("Usage: price value gold --weight 23 --purity 750 --currency EUR");
      const opts = parseArgs(rest);

      const weightStr = opts.get("weight");
      if (!weightStr) return err("--weight is required. Example: price value gold --weight 23 --purity 750");
      const weight = parseFloat(weightStr);
      if (isNaN(weight) || weight <= 0) return err(`Invalid weight: "${weightStr}".`);

      try {
        const unit = parseUnit(opts.get("unit"));
        const purity = parsePurity(opts.get("purity"));
        if (purity === null) return err("--purity is required for valuation. Use a stamp (333, 585, 750, 999) or karat (8K, 14K, 18K, 24K).");
        const currency = (opts.get("currency") || "EUR").toUpperCase();
        const symbol = resolveSymbol(assetName);

        const priceData = await fetchPrice(symbol, currency);
        const pricePerOz = priceData.price;
        const pricePerGram = pricePerOz / TROY_OZ_GRAMS;

        const weightGrams = weight * UNIT_TO_GRAMS[unit];
        const pureWeightGrams = weightGrams * purity;
        const pureWeightOz = pureWeightGrams / TROY_OZ_GRAMS;
        const value = pureWeightOz * pricePerOz;

        const lines = [
          `${weight}${unit} ${priceData.name || symbol} (${purityLabel(purity)})`,
          `Pure content: ${fmt(pureWeightGrams)}g (${pureWeightOz.toFixed(4)} troy oz)`,
          `Price: ${fmt(pricePerOz)} ${currency}/oz (${fmt(pricePerGram)} ${currency}/g)`,
          ``,
          `Value: ${fmt(value)} ${currency}`,
          ``,
          `Updated: ${priceData.updatedAtReadable || "just now"}`,
        ];
        return ok(lines.join("\n") + "\n");
      } catch (e) {
        return err(e instanceof Error ? e.message : "Valuation failed.");
      }
    }

    // ── price --help ───────────────────────────────────────────────────
    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "price - Metal prices, jewelry valuation, and currency conversion",
        "",
        "Usage:",
        "  price <asset> [--currency EUR]         Current price per troy ounce",
        "  price value <asset> --weight N --purity P [--unit g] [--currency EUR]",
        "  price convert <amount> --from USD --to EUR",
        "  price list                              Show available assets",
        "",
        "Assets: gold, silver, platinum, palladium, copper, bitcoin, ethereum",
        "Purity: 333, 585, 750, 999, 8K, 14K, 18K, 24K",
        "Units: g (default), kg, oz (troy), dwt (pennyweight)",
        "",
      ].join("\n"));
    }

    // ── price <asset> [--currency EUR] — default: show price ───────────
    const opts = parseArgs(args.slice(1));
    const currency = (opts.get("currency") || "EUR").toUpperCase();
    const symbol = resolveSymbol(sub);

    try {
      const data = await fetchPrice(symbol, currency);
      const pricePerGram = data.price / TROY_OZ_GRAMS;
      const lines = [
        `${data.name || symbol} (${data.symbol || symbol})`,
        `${fmt(data.price)} ${data.currency || currency}/oz`,
        `${fmt(pricePerGram)} ${data.currency || currency}/g`,
        `Updated: ${data.updatedAtReadable || "just now"}`,
      ];
      return ok(lines.join("\n") + "\n");
    } catch (e) {
      return err(e instanceof Error ? e.message : "Failed to fetch price.");
    }
  });
}
