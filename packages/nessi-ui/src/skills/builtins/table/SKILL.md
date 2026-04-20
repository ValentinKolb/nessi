---
name: table
description: "Query, filter, aggregate, group, sort, and transform CSV/XLSX files. Always use instead of awk, python, or manual parsing for tabular data."
metadata:
  nessi:
    command: table
    enabled: true
---

# Table

Work with CSV and XLSX files: inspect structure, query with filters, aggregations, and calculations, and export results.

## Inspect

```bash
table info /input/data.xlsx
table columns /input/data.xlsx --sheet "Sales"
table peek /input/data.xlsx --rows 10 --columns "name,revenue"
```

## Query

The `query` command combines filtering, aggregation, calculated columns, projection, aliases, sorting, and limiting in one step.

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

### Calculated columns with calc()

Use `calc(expression)` in `--select` to compute new columns. Supports `+`, `-`, `*`, `/` and parentheses.

**Row-level calculations** (like Excel formulas — applied to every row):

```bash
table query /input/products.xlsx \
  --select "product, price, calc(price * 1.19) as BruttoPreis" \
  --output /output/with-tax.csv

table query /input/orders.xlsx \
  --select "item, quantity, unit_price, calc(quantity * unit_price) as Total" \
  --output /output/totals.csv
```

**Aggregation-level calculations** (combine multiple aggregations):

```bash
table query /input/sales.xlsx \
  --select "region, sum(revenue) as Rev, sum(cost) as Cost, calc(sum(revenue) - sum(cost)) as Profit" \
  --group "region" \
  --output /output/profit.csv

table query /input/data.xlsx \
  --select "category, calc(sum(revenue) / count()) as AvgRevenue, calc((sum(revenue) - sum(cost)) / sum(revenue) * 100) as MarginPct" \
  --group "category" \
  --output /output/margins.csv
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

### Full example

```bash
table query /input/sales.xlsx \
  --select "region, sum(revenue) as Revenue, count() as Orders, calc(sum(revenue) / count()) as AvgOrder" \
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
| `=` / `!=` | `status = active` | Case-insensitive. `= ` (empty value) matches empty cells |
| `is empty` | `Einlieferer is empty` | Matches rows where the column is blank |
| `is not empty` | `email is not empty` | Matches rows where the column has a value |
| `>` `<` `>=` `<=` | `amount > 100` | Auto-detects numbers and dates |
| `contains` | `name contains Smith` | Substring match |
| `starts_with` | `email starts_with admin` | Prefix match |
| `matches` | `email matches ^.*@gmail\.com$` | Regex (case-insensitive) |

## Output behavior

- With `--output /output/file.csv` → writes CSV to file
- **Without `--output`** → prints result directly to stdout (useful for quick counts and inspections)

## Important

- **Do not** use `awk`, `node -e`, `python`, `grep`, or manual CSV parsing. This skill handles filtering, aggregation, calculations, counting, grouping, sorting, and export.
- For XLSX with multiple sheets, use `--sheet "SheetName"`.
- Pipe query output directly into `chart` for visualization — no manual value extraction needed.
- **Always show table results via CSV + `present`**, not via the `card` table layout. Write to `--output /output/result.csv`, then call `present /output/result.csv`. This avoids manually copying data into tool arguments and handles any number of rows. The `card` tool is only for small, hand-crafted data — table query results should always flow through files.
