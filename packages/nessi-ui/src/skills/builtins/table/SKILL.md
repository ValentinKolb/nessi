---
name: table
description: Read, filter, and transform CSV or XLSX files. Use this for ALL spreadsheet operations — never use grep, python, or pandas on tabular data.
metadata:
  nessi:
    command: table
    enabled: true
---

# Table

Use the `table` command for CSV and XLSX files. This is the only way to work with spreadsheet data — never fall back to grep, python, awk, or other tools.

## Workflow

1. `table info <file>` → see sheets, row counts, column counts
2. `table columns <file>` → list column names (you need exact names for filtering)
3. `table peek <file> --rows 5` → preview the first rows
4. `table filter <file> --where "..." --output /output/result.csv` → filter rows
5. Call the `present` tool on the output file so the user can see it

## Commands

### Inspect

```bash
table info /input/sales.xlsx
table sheets /input/sales.xlsx
table columns /input/sales.xlsx --sheet "Q1"
```

### Preview

```bash
table peek /input/sales.xlsx --sheet "Q1" --rows 20
table peek /input/contacts.csv --columns "name,email" --rows 25
```

### Filter

Filter rows with `--where`. Multiple conditions are AND-combined.

**Operators:** `=`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `starts_with`, `matches` (regex)

```bash
table filter /input/data.csv --where "status = active" --output /output/active.csv
table filter /input/data.csv --where "amount > 100" --where "category = Electronics" --output /output/big-electronics.csv
table filter /input/data.csv --where "name contains Smith" --columns "name,email" --limit 50 --output /output/smiths.csv
table filter /input/data.csv --where "date > 2024-01-01" --where "date < 2024-12-31" --output /output/2024.csv
table filter /input/data.xlsx --where "Einlieferer contains Intartis" --output /output/intartis.csv
table filter /input/data.csv --where "email matches ^.*@gmail\.com$" --output /output/gmail-users.csv
table filter /input/data.csv --where "code matches ^[A-Z]{2}-\d+" --output /output/coded.csv
```

**Important:** Use exact column names from `table columns`. String matching with `=` and `contains` is case-insensitive. Number and date comparisons are automatic.

### Export

```bash
table export /input/sales.xlsx --output /output/sales.csv
table export /input/sales.xlsx --sheet "Q1" --columns "name,revenue" --rows 100 --output /output/q1-summary.csv
```

### Append Rows

```bash
table append /input/contacts.csv --json '[{"name":"Alice","email":"alice@example.com"}]' --output /output/contacts-updated.csv
```

### Replace Values

```bash
table replace /input/tasks.csv --column "status" --old "pending" --new "done" --output /output/tasks-updated.csv
```

## Notes

- Supported input formats: CSV and XLSX.
- Write operations always output CSV files under `/output`.
- Use exact column names (from `table columns`) in `--where` and `--columns`.
- For XLSX, `--sheet` defaults to the first sheet.
- After creating an output file, always use the `present` tool to show it to the user.
