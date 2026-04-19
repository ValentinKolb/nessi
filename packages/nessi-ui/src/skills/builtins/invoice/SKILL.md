---
name: invoice
description: "Generate professional invoices as printable HTML, optionally with XRechnung XML. Use when the user needs a bill, receipt, or invoice. Supports logo, tax ID, and all German invoice fields."
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

When the user asks to create an invoice, gather the required information step by step. Check the user's memories first — business details like address, tax ID, and bank info are often stored there.

**Before creating the invoice, use the `survey` tool to ask:**

1. Whether they want an XRechnung XML alongside the HTML (important for B2B and public sector invoices in Germany)
2. Any missing required fields

Don't ask about XRechnung if the user already specified `--xrechnung` or said they don't need it. For B2B invoices or when the recipient is a public institution, suggest including XRechnung.

## Notes

- HTML output renders in an iframe with a print button (Print → Save as PDF)
- XRechnung XML follows EN 16931 / UBL 2.1 standard
- All calculations (subtotal, tax, total) are automatic
- Use `present` to display the invoice inline
- The address format for XRechnung expects: `Name\nStreet\nPostcode City` (each on a new line)
