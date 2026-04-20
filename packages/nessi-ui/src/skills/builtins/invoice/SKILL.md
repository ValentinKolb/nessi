---
name: invoice
description: "Generate invoices as printable HTML with optional XRechnung XML. Use for bills, receipts, or invoices."
metadata:
  nessi:
    command: invoice
    enabled: true
---

# Invoice

Generate clean, professional invoices as HTML with DIN A4 layout. Optionally generate a machine-readable XRechnung XML (EN 16931 / UBL 2.1) alongside.

## Command

```bash
invoice create --json '{ ... }'
invoice create --json '{ ... }' --xrechnung
```

The `--xrechnung` flag generates an additional XML file that can be imported into accounting software or submitted to public sector clients.

## JSON Fields

### Required

| Field | Description | Example |
|-------|-------------|---------|
| `from` | Sender address (`\n` for line breaks) | `"Kolb Antik\nIm Schotter 1\n95488 Bayreuth"` |
| `to` | Recipient address | `"Musterkunde GmbH\nBeispielweg 5\n10115 Berlin"` |
| `number` | Invoice number | `"2026-042"` |
| `date` | Invoice date | `"2026-04-19"` |
| `items` | Line items array | `[{"description":"...","quantity":1,"price":100,"unit":"Stk"}]` |

### Optional

| Field | Description |
|-------|-------------|
| `due` | Due date |
| `tax` | Tax rate (e.g., `19` for 19% MwSt) |
| `currency` | Currency code (default: EUR) |
| `period` | Service period |
| `reference` | Client reference / order number |
| `taxId` | USt-IdNr (e.g., "DE123456789") |
| `taxNumber` | Steuernummer |
| `court` | Amtsgericht + HRB |
| `ceo` | Geschäftsführer |
| `bank` | IBAN + bank name |
| `phone`, `email`, `web` | Contact info |
| `notes` | Footer notes (payment terms) |
| `logo` | Path to logo image (`/input/logo.png`) |

## How to handle invoice requests

Follow this order strictly:

1. **Check memories** for the user's business details (address, tax ID, bank, logo).
2. **Gather missing info** — ask for what you don't have (recipient, items, etc.).
3. **BEFORE generating**, use the `survey` tool to confirm:
   - Whether to include XRechnung XML (`--xrechnung`). Suggest it for B2B or public sector recipients.
   - Any open questions about format, tax rate, etc.
4. **Generate once** with all options — don't create the invoice, then ask, then regenerate.
5. **Present BOTH files** after generating:
   - `present /output/invoice-{number}.html` — the printable invoice
   - `present /output/xrechnung-{number}.xml` — the XRechnung XML (if generated)

## Notes

- HTML renders in an iframe with a print button (Print → Save as PDF)
- XRechnung XML follows EN 16931 / UBL 2.1 standard
- All calculations (subtotal, tax, total) are automatic
- Address format for XRechnung: `Name\nStreet\nPostcode City` (one per line)
