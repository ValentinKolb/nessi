---
name: table
description: "Query, filter, aggregate, and transform CSV/XLSX files. Use for any spreadsheet or tabular data task — inspection, filtering, grouping, statistics, export."
metadata:
  nessi:
    command: table
    enabled: true
---

# Table

Work with CSV and XLSX files: inspect structure, query with filters and aggregations, and export results.

## Inspect

```bash
table info /input/data.xlsx
table columns /input/data.xlsx --sheet "Sales"
table peek /input/data.xlsx --rows 10 --columns "name,revenue"
```

## Query (filter + aggregate + sort)

The `query` command combines filtering, aggregation, projection, aliases, sorting, and limiting in one step.

### Filter rows

```bash
table query /input/sales.xlsx --where "year = 2024" --output /output/filtered.csv
table query /input/sales.xlsx --where "status = active" --where "amount > 100" --output /output/result.csv
```

### Aggregate with grouping

```bash
table query /input/sales.xlsx \
  --select "region, sum(revenue) as Total, count() as Deals, avg(price) as Avg" \
  --group "region" \
  --output /output/by-region.csv
```

Aggregation functions: `count()`, `sum(col)`, `avg(col)`, `min(col)`, `max(col)`, `median(col)`.

### Global aggregation (no group)

```bash
table query /input/sales.xlsx --select "sum(revenue), count(), avg(price)"
```

### Project and rename columns

```bash
table query /input/data.xlsx --select "product as Produkt, revenue as Umsatz"
```

### Sort and limit

```bash
table query /input/sales.xlsx \
  --select "product, sum(revenue) as Revenue" \
  --group "product" \
  --sort "Revenue desc" \
  --limit 5 \
  --output /output/top5.csv
```

### Full example: filter + aggregate + sort

```bash
table query /input/sales.xlsx \
  --select "region, sum(revenue) as Revenue, count() as Orders" \
  --where "year >= 2023" \
  --group "region" \
  --sort "Revenue desc" \
  --limit 10 \
  --output /output/by-region.csv
```

## Pipeline: table → chart

Query results feed directly into chart commands:

```bash
table query /input/sales.xlsx \
  --select "region as Region, sum(revenue) as Revenue" \
  --group "region" --output /output/agg.csv

chart bar /output/agg.csv --x "Region" --y "Revenue" --title "Revenue by Region"
present /output/bar-chart.svg
```

## Export & Transform

```bash
table export /input/data.xlsx --output /output/data.csv
table append /input/data.csv --json '[{"name":"Alice","age":"30"}]' --output /output/appended.csv
table replace /input/data.csv --column "status" --old "pending" --new "done" --output /output/replaced.csv
```

## Filter operators

| Operator | Example | Notes |
|----------|---------|-------|
| `=` / `!=` | `status = active` | Case-insensitive |
| `>` `<` `>=` `<=` | `amount > 100` | Auto-detects numbers and dates |
| `contains` | `name contains Smith` | Substring match |
| `starts_with` | `email starts_with admin` | Prefix match |
| `matches` | `email matches ^.*@gmail\.com$` | Regex (case-insensitive) |

## Notes

- Output goes to `/output/` (required).
- For XLSX with multiple sheets, use `--sheet "SheetName"`.
- All cell values are treated as strings internally; numeric comparisons auto-detect numbers.
