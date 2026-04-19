export default function create(api) {
  const { defineCommand, ok, err, parseArgs, helpers } = api;

  const fmt = (n, currency) => {
    const c = currency || "EUR";
    const sym = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" }[c] || c;
    const formatted = n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formatted}\u00A0${sym}`;
  };

  const escHtml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const nl2br = (s) => escHtml(s).replace(/\\n/g, "<br>").replace(/\n/g, "<br>");

  /** Read a logo file and convert to base64 data URL. */
  const loadLogo = async (ctx, path) => {
    if (!path) return null;
    try {
      let bytes;
      try { bytes = await helpers.files.readBytes(path); }
      catch { bytes = await ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, path)); }

      const ext = path.split(".").pop()?.toLowerCase();
      if (ext === "svg") {
        const svgText = new TextDecoder().decode(bytes);
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`;
      }
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return `data:${mime};base64,${btoa(binary)}`;
    } catch {
      return null;
    }
  };

  const generateInvoiceHtml = (inv, logoDataUrl) => {
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

    // Footer metadata line
    const footerParts = [];
    if (inv.from) footerParts.push(escHtml(String(inv.from).replace(/\\n/g, " · ").replace(/\n/g, " · ")));
    if (inv.taxId) footerParts.push(`USt-IdNr: ${escHtml(inv.taxId)}`);
    if (inv.taxNumber) footerParts.push(`St.Nr: ${escHtml(inv.taxNumber)}`);
    if (inv.court) footerParts.push(escHtml(inv.court));
    if (inv.ceo) footerParts.push(`GF: ${escHtml(inv.ceo)}`);
    const footerLine = footerParts.length > 1 ? footerParts.join(" · ") : "";

    const contactParts = [];
    if (inv.phone) contactParts.push(escHtml(inv.phone));
    if (inv.email) contactParts.push(escHtml(inv.email));
    if (inv.web) contactParts.push(escHtml(inv.web));
    const contactLine = contactParts.join(" · ");

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4; margin: 20mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; font-size: 14px; color: #1a1a1a; padding: 48px; width: 170mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px; }
  .header h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; }
  .logo { max-height: 56px; max-width: 180px; }
  .addresses { display: flex; justify-content: space-between; margin-bottom: 36px; gap: 48px; }
  .address { flex: 1; }
  .address-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
  .meta { display: flex; gap: 36px; margin-bottom: 24px; font-size: 13px; color: #555; }
  .meta-item { display: flex; flex-direction: column; }
  .meta-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #999; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; padding: 8px 0; border-bottom: 2px solid #e5e5e5; }
  td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; white-space: nowrap; }
  td:first-child { white-space: normal; }
  .totals { margin-left: auto; width: 260px; }
  .totals tr td { border: none; padding: 4px 0; }
  .totals .total-row td { font-weight: 700; font-size: 18px; padding-top: 10px; border-top: 2px solid #1a1a1a; }
  .footer { margin-top: 48px; font-size: 11px; color: #888; border-top: 1px solid #e5e5e5; padding-top: 12px; line-height: 1.6; }
  @media print { body { padding: 0; width: auto; } }
</style>
</head>
<body>
  <div class="header">
    <div>
      ${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Logo" style="margin-bottom:12px"><br>` : ""}
      <h1>Rechnung</h1>
    </div>
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

  <div class="meta">
    ${inv.due ? `<div class="meta-item"><span class="meta-label">Fällig</span>${escHtml(inv.due)}</div>` : ""}
    ${inv.period ? `<div class="meta-item"><span class="meta-label">Leistungszeitraum</span>${escHtml(inv.period)}</div>` : ""}
    ${inv.reference ? `<div class="meta-item"><span class="meta-label">Referenz</span>${escHtml(inv.reference)}</div>` : ""}
  </div>

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
    ${inv.bank ? `<div>${nl2br(inv.bank)}</div>` : ""}
    ${inv.notes ? `<div>${nl2br(inv.notes)}</div>` : ""}
    ${footerLine ? `<div style="margin-top:8px">${footerLine}</div>` : ""}
    ${contactLine ? `<div>${contactLine}</div>` : ""}
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
        "Required: from, to, number, date, items: [{description, quantity, price, unit?}]",
        "Optional: due, tax (%), currency, period, reference, notes, bank,",
        "          taxId, taxNumber, court, ceo, phone, email, web, logo",
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
      const logoDataUrl = await loadLogo(ctx, inv.logo);
      const html = generateInvoiceHtml(inv, logoDataUrl);
      const filename = `invoice-${(inv.number || "draft").replace(/[^a-zA-Z0-9-_]/g, "_")}.html`;
      const outputPath = `/output/${filename}`;
      await ctx.fs.mkdir("/output", { recursive: true });
      await ctx.fs.writeFile(outputPath, html, "utf8");

      const itemCount = inv.items.length;
      return ok(`Invoice created with ${itemCount} item${itemCount !== 1 ? "s" : ""} at ${outputPath}\nUse present to display it inline.\n`);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Invoice generation failed.");
    }
  });
}
