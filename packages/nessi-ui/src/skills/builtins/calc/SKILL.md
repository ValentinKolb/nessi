---
name: calc
description: "Math expressions and date arithmetic. Use for any numeric calculation or date offset (\"in 90 days\"). For currency conversion, use the price skill instead."
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

## Notes

- Math uses JavaScript expressions (sandboxed via `Function`).
- Date supports `days`, `weeks`, `months`, and `years` offsets.
- For currency conversion, use `price convert 100 --from USD --to EUR` (the price skill).
