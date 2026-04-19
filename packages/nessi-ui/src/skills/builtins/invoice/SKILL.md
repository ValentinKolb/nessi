---
name: invoice
description: "Generate professional invoices as HTML files. Use when the user needs to create a bill, receipt, or invoice for clients or customers."
metadata:
  nessi:
    command: invoice
    enabled: true
---

# Invoice

Generate clean, professional invoices as HTML files that can be printed or saved as PDF via the browser.

## Command

```bash
invoice create --json '{"from":"My Company\\nStreet 1\\n12345 Berlin","to":"Client GmbH\\nOther Street 2\\n54321 Munich","number":"2026-042","date":"2026-04-19","due":"2026-05-19","items":[{"description":"Web Development","quantity":40,"unit":"hours","price":95},{"description":"Hosting Setup","quantity":1,"unit":"piece","price":250}],"tax":19,"currency":"EUR","notes":"Payment via bank transfer.","bank":"IBAN: DE89 3704 0044 0532 0130 00"}'
```

## JSON Fields

| Field | Required | Description |
|-------|----------|-------------|
| `from` | yes | Sender name + address (use `\n` for line breaks) |
| `to` | yes | Recipient name + address |
| `number` | yes | Invoice number |
| `date` | yes | Invoice date |
| `due` | no | Due date |
| `items` | yes | Array of line items (see below) |
| `tax` | no | Tax rate in percent (e.g., 19 for 19% MwSt) |
| `currency` | no | Currency symbol or code (default: EUR) |
| `notes` | no | Footer notes (payment terms, etc.) |
| `bank` | no | Bank details |

### Line Item Fields

| Field | Required | Description |
|-------|----------|-------------|
| `description` | yes | What was delivered |
| `quantity` | yes | Number of units |
| `unit` | no | Unit label (hours, pieces, etc.) |
| `price` | yes | Price per unit |

## How to gather information

When the user wants to create an invoice, you need:
1. **Who is it from?** (company name, address)
2. **Who is it to?** (client name, address)
3. **What was delivered?** (line items with quantity and price)
4. **Invoice number and date?**
5. **Tax rate?** (19% is standard in Germany)

If the user has memories with their business details, use those. Otherwise ask.

## Notes

- Output is an HTML file at `/output/invoice-{number}.html`
- The user can print it to PDF from the browser (Ctrl+P → Save as PDF)
- Use `present` to show the invoice inline after generating it
- All calculations (subtotal, tax, total) are done by the skill — the agent should not calculate them manually
