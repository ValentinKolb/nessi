export default function create(api) {
  const { cli, ok, err, positionalArgs, parseArgs } = api;

  // ── Math ──────────────────────────────────────────────────────────────

  const evalMath = (expr) => {
    try {
      const fn = new Function(`"use strict"; return (${expr});`);
      const result = fn();
      if (typeof result === "number" || typeof result === "string") return String(result);
      return JSON.stringify(result);
    } catch (e) {
      throw new Error(`Invalid expression: ${e instanceof Error ? e.message : expr}`);
    }
  };

  // ── Date ──────────────────────────────────────────────────────────────

  const DATE_PATTERN = /^(.+?)\s*([+-])\s*(\d+)\s+(days?|weeks?|months?|years?)$/i;

  const parseBaseDate = (str) => {
    const trimmed = str.trim().toLowerCase();
    if (trimmed === "now" || trimmed === "today") return new Date();
    const d = new Date(str.trim());
    if (isNaN(d.getTime())) throw new Error(`Invalid date: "${str.trim()}"`);
    return d;
  };

  const evalDate = (expr) => {
    const match = expr.match(DATE_PATTERN);
    if (!match) throw new Error('Format: "<date> +/- <n> days|weeks|months|years"');

    const base = parseBaseDate(match[1]);
    const sign = match[2] === "+" ? 1 : -1;
    const amount = parseInt(match[3], 10) * sign;
    const unit = match[4].toLowerCase().replace(/s$/, "");

    const result = new Date(base);
    switch (unit) {
      case "day": result.setDate(result.getDate() + amount); break;
      case "week": result.setDate(result.getDate() + amount * 7); break;
      case "month": result.setMonth(result.getMonth() + amount); break;
      case "year": result.setFullYear(result.getFullYear() + amount); break;
      default: throw new Error(`Unknown unit: ${unit}`);
    }

    return result.toISOString().split("T")[0];
  };

  // ── Currency ──────────────────────────────────────────────────────────

  const fetchRate = async (from, to, amount) => {
    const url = `https://api.frankfurter.dev/v1/latest?amount=${amount}&from=${from.toUpperCase()}&to=${to.toUpperCase()}`;
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`API error ${response.status}: ${text || response.statusText}`);
    }
    return response.json();
  };

  // ── CLI ───────────────────────────────────────────────────────────────

  return cli({ name: "calc", description: "Math, date arithmetic, and currency conversion" })
    .sub({
      name: "math",
      usage: 'math "<expression>"',
      async handler(args) {
        const expr = positionalArgs(args)[0];
        if (!expr) return err('Usage: calc math "2 + 3 * 4"');
        try {
          return ok(`${evalMath(expr)}\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Evaluation failed.");
        }
      },
    })
    .sub({
      name: "date",
      usage: 'date "<date> +/- <n> days|weeks|months|years"',
      async handler(args) {
        const expr = positionalArgs(args)[0];
        if (!expr) return err('Usage: calc date "2024-01-15 + 90 days"');
        try {
          return ok(`${evalDate(expr)}\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Date calculation failed.");
        }
      },
    })
    .sub({
      name: "currency",
      usage: 'currency <amount> --from USD --to EUR',
      async handler(args) {
        const amount = parseFloat(positionalArgs(args)[0]);
        if (!amount || isNaN(amount)) return err("Usage: calc currency 100 --from USD --to EUR");
        const opts = parseArgs(args);
        const from = opts.get("from");
        const to = opts.get("to");
        if (!from || !to) return err("Both --from and --to are required.");
        try {
          const data = await fetchRate(from, to, amount);
          const rates = data.rates || {};
          const target = to.toUpperCase();
          const converted = rates[target];
          if (converted === undefined) return err(`No rate found for ${target}.`);
          return ok(`${amount} ${from.toUpperCase()} = ${converted} ${target}\n(Date: ${data.date})\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Currency conversion failed.");
        }
      },
    });
}
