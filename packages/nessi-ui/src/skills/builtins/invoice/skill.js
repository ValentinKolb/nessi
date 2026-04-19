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
  const escXml = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  /** Read a logo file and convert to base64 data URL. */
  const loadLogo = async (ctx, path) => {
    if (!path) return null;
    try {
      let bytes;
      try { bytes = await helpers.files.readBytes(path); }
      catch { bytes = await ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, path)); }
      const ext = path.split(".").pop()?.toLowerCase();
      if (ext === "svg") {
        return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(new TextDecoder().decode(bytes))))}`;
      }
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return `data:${mime};base64,${btoa(binary)}`;
    } catch { return null; }
  };

  // ── Compute totals ─────────────────────────────────────────────────────

  const computeTotals = (inv) => {
    const taxRate = inv.tax ? parseFloat(inv.tax) / 100 : 0;
    const currency = inv.currency || "EUR";
    let subtotal = 0;
    const lines = (inv.items || []).map((item) => {
      const qty = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      const total = qty * price;
      subtotal += total;
      return { ...item, qty, price, total };
    });
    const taxAmount = subtotal * taxRate;
    const grandTotal = subtotal + taxAmount;
    return { lines, subtotal, taxRate, taxAmount, grandTotal, currency };
  };

  // ── HTML Invoice ───────────────────────────────────────────────────────

  const generateInvoiceHtml = (inv, logoDataUrl) => {
    const { lines, subtotal, taxRate, taxAmount, grandTotal, currency } = computeTotals(inv);

    const itemRows = lines.map((item) =>
      `<tr><td>${escHtml(item.description)}</td><td style="text-align:right">${item.qty}${item.unit ? ` ${escHtml(item.unit)}` : ""}</td><td style="text-align:right">${fmt(item.price, currency)}</td><td style="text-align:right">${fmt(item.total, currency)}</td></tr>`
    ).join("\n");

    const footerParts = [];
    if (inv.from) footerParts.push(escHtml(String(inv.from).replace(/\\n/g, " · ").replace(/\n/g, " · ")));
    if (inv.taxId) footerParts.push(`USt-IdNr: ${escHtml(inv.taxId)}`);
    if (inv.taxNumber) footerParts.push(`St.Nr: ${escHtml(inv.taxNumber)}`);
    if (inv.court) footerParts.push(escHtml(inv.court));
    if (inv.ceo) footerParts.push(`GF: ${escHtml(inv.ceo)}`);
    const footerLine = footerParts.length > 1 ? footerParts.join(" · ") : "";
    const contactParts = [inv.phone, inv.email, inv.web].filter(Boolean).map(escHtml);
    const contactLine = contactParts.join(" · ");

    // Compact one-liner for tfoot (repeats on every printed page)
    const tfootLine = [footerLine, contactLine].filter(Boolean).join(" · ");

    return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8">
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
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-variant-numeric: tabular-nums; }
  table.items thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; padding: 8px 0; border-bottom: 2px solid #e5e5e5; }
  table.items tbody td { padding: 10px 0; border-bottom: 1px solid #f0f0f0; white-space: nowrap; }
  table.items tbody td:first-child { white-space: normal; }
  table.items tfoot td { font-size: 9px; color: #bbb; border: none; padding: 8px 0 0 0; text-align: center; }
  .totals { margin-left: auto; width: 260px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  .totals tr td { border: none; padding: 4px 0; }
  .totals .total-row td { font-weight: 700; font-size: 18px; padding-top: 10px; border-top: 2px solid #1a1a1a; }
  .footer { margin-top: 48px; font-size: 11px; color: #888; border-top: 1px solid #e5e5e5; padding-top: 12px; line-height: 1.6; }
  @media print { body { padding: 0; width: auto; } }
</style>
</head>
<body>
  <div class="header">
    <div>${logoDataUrl ? `<img src="${logoDataUrl}" class="logo" alt="Logo" style="margin-bottom:12px"><br>` : ""}<h1>Rechnung</h1></div>
    <div style="text-align:right;font-size:13px;color:#888">${inv.number ? `Nr. ${escHtml(inv.number)}<br>` : ""}${inv.date ? escHtml(inv.date) : ""}</div>
  </div>
  <div class="addresses">
    <div class="address"><div class="address-label">Von</div><div>${nl2br(inv.from)}</div></div>
    <div class="address"><div class="address-label">An</div><div>${nl2br(inv.to)}</div></div>
  </div>
  <div class="meta">
    ${inv.due ? `<div class="meta-item"><span class="meta-label">Fällig</span>${escHtml(inv.due)}</div>` : ""}
    ${inv.period ? `<div class="meta-item"><span class="meta-label">Leistungszeitraum</span>${escHtml(inv.period)}</div>` : ""}
    ${inv.reference ? `<div class="meta-item"><span class="meta-label">Referenz</span>${escHtml(inv.reference)}</div>` : ""}
  </div>
  <table class="items">
    <thead><tr><th>Beschreibung</th><th style="text-align:right">Menge</th><th style="text-align:right">Preis</th><th style="text-align:right">Gesamt</th></tr></thead>
    ${tfootLine ? `<tfoot><tr><td colspan="4">${escHtml(tfootLine)}</td></tr></tfoot>` : ""}
    <tbody>${itemRows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Netto</td><td style="text-align:right">${fmt(subtotal, currency)}</td></tr>
    ${taxRate > 0 ? `<tr><td>MwSt (${inv.tax}%)</td><td style="text-align:right">${fmt(taxAmount, currency)}</td></tr>` : ""}
    <tr class="total-row"><td>Gesamt</td><td style="text-align:right">${fmt(grandTotal, currency)}</td></tr>
  </table>
  <div class="footer">
    ${inv.bank ? `<div>${nl2br(inv.bank)}</div>` : ""}
    ${inv.notes ? `<div>${nl2br(inv.notes)}</div>` : ""}
    ${footerLine ? `<div style="margin-top:8px">${footerLine}</div>` : ""}
    ${contactLine ? `<div>${contactLine}</div>` : ""}
  </div>
</body></html>`;
  };

  // ── XRechnung XML (UBL 2.1 / EN 16931) ────────────────────────────────

  const generateXRechnung = (inv) => {
    const { lines, subtotal, taxRate, taxAmount, grandTotal, currency } = computeTotals(inv);
    const taxPercent = inv.tax ? parseFloat(inv.tax) : 0;
    const d = (v) => parseFloat(v || 0).toFixed(2);

    const parseAddress = (raw) => {
      const parts = String(raw || "").replace(/\\n/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
      const name = parts[0] || "";
      const street = parts[1] || "";
      const cityLine = parts[2] || "";
      const plzMatch = cityLine.match(/^(\d{4,5})\s+(.+)$/);
      return { name, street, postcode: plzMatch?.[1] || "", city: plzMatch?.[2] || cityLine, country: "DE" };
    };

    const seller = parseAddress(inv.from);
    const buyer = parseAddress(inv.to);

    const invoiceLines = lines.map((item, i) => `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${escXml(item.unit === "hours" || item.unit === "Std." || item.unit === "h" ? "HUR" : "C62")}">${item.qty}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${d(item.total)}</cbc:LineExtensionAmount>
      <cac:Item><cbc:Name>${escXml(item.description)}</cbc:Name>
        <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${taxPercent}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price><cbc:PriceAmount currencyID="${currency}">${d(item.price)}</cbc:PriceAmount></cac:Price>
    </cac:InvoiceLine>`).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${escXml(inv.number || "DRAFT")}</cbc:ID>
  <cbc:IssueDate>${escXml(inv.date || new Date().toISOString().split("T")[0])}</cbc:IssueDate>
  ${inv.due ? `<cbc:DueDate>${escXml(inv.due)}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${inv.notes ? `<cbc:Note>${escXml(inv.notes)}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  ${inv.reference ? `<cbc:BuyerReference>${escXml(inv.reference)}</cbc:BuyerReference>` : `<cbc:BuyerReference>${escXml(inv.number || "N/A")}</cbc:BuyerReference>`}
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyName><cbc:Name>${escXml(seller.name)}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${escXml(seller.street)}</cbc:StreetName>
      <cbc:CityName>${escXml(seller.city)}</cbc:CityName>
      <cbc:PostalZone>${escXml(seller.postcode)}</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>${seller.country}</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    ${inv.taxId ? `<cac:PartyTaxScheme><cbc:CompanyID>${escXml(inv.taxId)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
    <cac:PartyLegalEntity><cbc:RegistrationName>${escXml(seller.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
    ${inv.email ? `<cac:Contact><cbc:ElectronicMail>${escXml(inv.email)}</cbc:ElectronicMail></cac:Contact>` : ""}
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cac:PartyName><cbc:Name>${escXml(buyer.name)}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>${escXml(buyer.street)}</cbc:StreetName>
      <cbc:CityName>${escXml(buyer.city)}</cbc:CityName>
      <cbc:PostalZone>${escXml(buyer.postcode)}</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>${buyer.country}</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>${escXml(buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  ${inv.bank ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${escXml(String(inv.bank).replace(/[^A-Z0-9]/gi, "").slice(0, 34))}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ""}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${d(taxAmount)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${d(subtotal)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${d(taxAmount)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>${taxPercent}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${d(subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${d(subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${d(grandTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${currency}">${d(grandTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${invoiceLines}
</Invoice>`;
  };

  // ── Command ────────────────────────────────────────────────────────────

  return defineCommand("invoice", async (args, ctx) => {
    const sub = (args[0] || "").toLowerCase();

    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "invoice - Generate professional invoices",
        "",
        "  invoice create --json '{...}' [--xrechnung]",
        "",
        "Required: from, to, number, date, items: [{description, quantity, price, unit?}]",
        "Optional: due, tax (%), currency, period, reference, notes, bank,",
        "          taxId, taxNumber, court, ceo, phone, email, web, logo",
        "",
        "Flags:",
        "  --xrechnung   Also generate XRechnung XML (EN 16931 / UBL 2.1)",
        "",
      ].join("\n"));
    }

    if (sub !== "create") return err(`Unknown subcommand. Use: invoice create --json '{...}'`);

    const opts = parseArgs(args.slice(1));
    const jsonStr = opts.get("json");
    if (!jsonStr) return err("--json is required. See: invoice --help");
    const wantXRechnung = args.includes("--xrechnung");

    let inv;
    try { inv = JSON.parse(jsonStr); } catch { return err("Invalid JSON. Check your quotes and escaping."); }

    if (!inv.from) return err("Missing 'from' (sender address).");
    if (!inv.to) return err("Missing 'to' (recipient address).");
    if (!inv.items || !Array.isArray(inv.items) || inv.items.length === 0) return err("Missing 'items' array.");

    try {
      const logoDataUrl = await loadLogo(ctx, inv.logo);
      const html = generateInvoiceHtml(inv, logoDataUrl);
      const stem = (inv.number || "draft").replace(/[^a-zA-Z0-9-_]/g, "_");
      const htmlPath = `/output/invoice-${stem}.html`;
      await ctx.fs.mkdir("/output", { recursive: true });
      await ctx.fs.writeFile(htmlPath, html, "utf8");

      const resultLines = [`Invoice created at ${htmlPath}`];

      if (wantXRechnung) {
        const xml = generateXRechnung(inv);
        const xmlPath = `/output/xrechnung-${stem}.xml`;
        await ctx.fs.writeFile(xmlPath, xml, "utf8");
        resultLines.push(`XRechnung XML at ${xmlPath}`);
      }

      resultLines.push("Use present to display the invoice inline.");
      return ok(resultLines.join("\n") + "\n");
    } catch (e) {
      return err(e instanceof Error ? e.message : "Invoice generation failed.");
    }
  });
}
