---
name: invoice
description: "Generate professional invoices as printable HTML. Use when the user needs to create a bill, receipt, or invoice. Supports logo, tax ID, and all required German invoice fields."
metadata:
  nessi:
    command: invoice
    enabled: true
---

# Invoice

Generate clean, professional invoices as HTML files with DIN A4 layout. The user can print to PDF directly from the browser.

## Command

```bash
invoice create --json '{ ... }'
```

## JSON Fields

### Required

| Field | Description | Example |
|-------|-------------|---------|
| `from` | Sender name + address (`\n` for line breaks) | `"Kolb Antik\nIm Schotter 1\n95488 Bayreuth"` |
| `to` | Recipient name + address | `"Musterkunde GmbH\nBeispielweg 5\n10115 Berlin"` |
| `number` | Invoice number | `"2026-042"` |
| `date` | Invoice date | `"2026-04-19"` |
| `items` | Array of line items | see below |

### Line Items

Each item: `{ "description": "...", "quantity": N, "price": N, "unit": "hours" }`

### Optional

| Field | Description |
|-------|-------------|
| `due` | Due date |
| `tax` | Tax rate in percent (e.g., `19` for 19% MwSt) |
| `currency` | Currency code (default: EUR) |
| `period` | Service period (e.g., "01.03. – 31.03.2026") |
| `reference` | Client reference or order number |
| `taxId` | USt-IdNr (e.g., "DE123456789") |
| `taxNumber` | Steuernummer (e.g., "123/456/78901") |
| `court` | Amtsgericht + Handelsregister (e.g., "AG Bayreuth, HRB 1234") |
| `ceo` | Geschäftsführer name |
| `bank` | IBAN and bank name |
| `phone` | Phone number |
| `email` | Email address |
| `web` | Website |
| `notes` | Footer notes (payment terms, etc.) |
| `logo` | Path to a logo image (e.g., `/input/logo.png` or `/input/logo.svg`) |

## How to gather information

When the user wants to create an invoice, you need at minimum:
1. **Who is it from?** — name, address (check user memories first!)
2. **Who is it to?** — client name, address
3. **What was delivered?** — line items with quantity and price
4. **Invoice number and date?**
5. **Tax rate?** — 19% is standard in Germany

For business metadata (tax ID, court, CEO), check the user's memories. If not available, ask if they want to include it.

If the user has uploaded a logo image, use its path in the `logo` field.

## Notes

- Output is an HTML file at `/output/invoice-{number}.html`
- Use `present` to show the invoice inline — it renders in an iframe with a print button
- The print button opens the invoice in a new tab for Ctrl+P → Save as PDF
- All calculations (subtotal, tax, total) are done by the skill automatically
- The layout is DIN A4 optimized for printing
