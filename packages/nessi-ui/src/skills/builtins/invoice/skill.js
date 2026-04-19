export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs } = api;

  const fmt = (n, currency) => {
    const c = currency || "EUR";
    const sym = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" }[c] || c;
    return `${n.toFixed(2)} ${sym}`;
  };

  const escHtml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nl2br = (s) => escHtml(s).replace(/\\n/g, "<br>").replace(/\n/g, "<br>");

  const generateInvoiceHtml = (inv) => {
    const items = inv.items || [];
    const taxRate = inv.tax ? parseFloat(inv.tax) / 100 : 0;
    const currency = inv.currency || "EUR";

    let subtotal = 0;
    const itemRows = items.map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      const total = qty * price;
      subtotal += total;
      return `<tr>
        <td>${escHtml(item.description)}</td>
        <td style="text-align:right">${qty}${item.unit ? ` ${escHtml(item.unit)}` : ""}</td>
        <td style="text-align:right">${fmt(price, currency)}</td>
        <td style="text-align:right">${fmt(total, currency)}</td>
      </tr>`;
    }).join("\n");

    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; color: #1a1a1a; padding: 48px; max-width: 800px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; margin-bottom: 48px; }
  .header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .addresses { display: flex; justify-content: space-between; margin-bottom: 36px; gap: 48px; }
  .address { flex: 1; }
  .address-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
  .meta { display: flex; gap: 36px; margin-bottom: 24px; font-size: 13px; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; padding: 8px 0; border-bottom: 2px solid #e5e5e5; }
  td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; }
  .totals { margin-left: auto; width: 260px; }
  .totals tr td { border: none; padding: 4px 0; }
  .totals .total-row td { font-weight: 700; font-size: 18px; padding-top: 10px; border-top: 2px solid #1a1a1a; }
  .footer { margin-top: 48px; font-size: 12px; color: #888; border-top: 1px solid #e5e5e5; padding-top: 16px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="header">
    <h1>Rechnung</h1>
    <div style="text-align:right;font-size:13px;color:#888">
      ${inv.number ? `Nr. ${escHtml(inv.number)}<br>` : ""}
      ${inv.date ? escHtml(inv.date) : ""}
    </div>
  </div>

  <div class="addresses">
    <div class="address">
      <div class="address-label">Von</div>
      <div>${nl2br(inv.from)}</div>
    </div>
    <div class="address">
      <div class="address-label">An</div>
      <div>${nl2br(inv.to)}</div>
    </div>
  </div>

  ${inv.due ? `<div class="meta"><div>Fällig: ${escHtml(inv.due)}</div></div>` : ""}

  <table>
    <thead>
      <tr>
        <th>Beschreibung</th>
        <th style="text-align:right">Menge</th>
        <th style="text-align:right">Preis</th>
        <th style="text-align:right">Gesamt</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Netto</td><td style="text-align:right">${fmt(subtotal, currency)}</td></tr>
    ${taxRate > 0 ? `<tr><td>MwSt (${inv.tax}%)</td><td style="text-align:right">${fmt(taxAmount, currency)}</td></tr>` : ""}
    <tr class="total-row"><td>Gesamt</td><td style="text-align:right">${fmt(total, currency)}</td></tr>
  </table>

  <div class="footer">
    ${inv.bank ? `<div style="margin-bottom:8px">${nl2br(inv.bank)}</div>` : ""}
    ${inv.notes ? `<div>${nl2br(inv.notes)}</div>` : ""}
  </div>
</body>
</html>`;
  };

  return defineCommand("invoice", async (args, ctx) => {
    const sub = (args[0] || "").toLowerCase();

    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "invoice - Generate professional invoices",
        "",
        "  invoice create --json '{...}'",
        "",
        "JSON: { from, to, number, date, due?, items: [{description, quantity, price, unit?}], tax?, currency?, notes?, bank? }",
        "",
      ].join("\n"));
    }

    if (sub !== "create") return err(`Unknown subcommand. Use: invoice create --json '{...}'`);

    const opts = parseArgs(args.slice(1));
    const jsonStr = opts.get("json");
    if (!jsonStr) return err("--json is required. See: invoice --help");

    let inv;
    try { inv = JSON.parse(jsonStr); } catch { return err("Invalid JSON. Check your quotes and escaping."); }

    if (!inv.from) return err("Missing 'from' (sender address).");
    if (!inv.to) return err("Missing 'to' (recipient address).");
    if (!inv.items || !Array.isArray(inv.items) || inv.items.length === 0) return err("Missing 'items' array.");

    try {
      const html = generateInvoiceHtml(inv);
      const filename = `invoice-${(inv.number || "draft").replace(/[^a-zA-Z0-9-_]/g, "_")}.html`;
      const outputPath = `/output/${filename}`;
      const dir = "/output";
      await ctx.fs.mkdir(dir, { recursive: true });
      await ctx.fs.writeFile(outputPath, html, "utf8");

      const itemCount = inv.items.length;
      return ok(`Invoice created with ${itemCount} item${itemCount !== 1 ? "s" : ""} at ${outputPath}\nUse present to display it inline, or open it in the browser to print as PDF.\n`);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Invoice generation failed.");
    }
  });
}
