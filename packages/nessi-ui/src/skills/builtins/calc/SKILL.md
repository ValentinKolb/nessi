---
name: calc
description: Calculations, date arithmetic, and live currency conversion. Use this for math expressions, date offsets, and exchange rates.
metadata:
  nessi:
    command: calc
    enabled: true
---

# Calc

Use the `calc` command for quick calculations.

Prefer this when the user wants to:
- evaluate a math expression
- calculate a date offset (add/subtract days, weeks, months)
- convert currencies at live exchange rates

## Commands

### Math

```bash
calc math "2 + 3 * 4"
calc math "(100 / 3).toFixed(2)"
calc math "Math.sqrt(144)"
```

### Date

```bash
calc date "2024-01-15 + 90 days"
calc date "2024-06-01 - 2 weeks"
calc date "2024-03-01 + 3 months"
calc date "now + 30 days"
```

### Currency

```bash
calc currency 100 --from USD --to EUR
calc currency 50 --from GBP --to JPY
```

## Notes

- Math uses JavaScript expressions (sandboxed via `Function`).
- Date supports `days`, `weeks`, `months`, and `years` offsets.
- Currency rates are fetched live from frankfurter.app (no API key needed).
- All results are returned as plain text.
