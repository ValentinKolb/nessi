---
name: chart
description: "Generate bar, line, pie, or scatter charts from CSV files or inline data. Pipe table query output into chart."
metadata:
  nessi:
    command: chart
    enabled: true
---

# Chart

Create data visualizations as SVG. Charts render inline in the chat with a download button.

There are **4 chart types**: `bar`, `line`, `pie`, `scatter`. Each reads data from a CSV file or accepts inline values.

## Chart types at a glance

| Type | Best for | X axis | Y axis |
|------|----------|--------|--------|
| `bar` | Comparing categories | Category names | One numeric column |
| `line` | Trends over time | Time labels | One or more numeric columns |
| `pie` | Proportions of a whole | Category names | One numeric column |
| `scatter` | Correlation between two numbers | Numeric column | Numeric column |

## From CSV file (recommended)

Always use this when data comes from `table query`. Pass the CSV path as the first argument:

```bash
chart bar /output/data.csv --x "region" --y "revenue" --title "Revenue by Region"
chart pie /output/data.csv --x "category" --y "amount" --title "Distribution"
chart line /output/data.csv --x "quarter" --y "revenue,cost,profit" --title "Trends"
chart scatter /output/data.csv --x "frequency" --y "volume" --label "customer" --title "Segmentation"
```

### Options for CSV mode

- `--x "column"` — the label/category column (required)
- `--y "column"` — the value column (required). For `line`, use comma-separated columns for multiple series
- `--label "column"` — (scatter only) show point names next to dots
- `--title "text"` — chart title
- `--output /output/name.svg` — custom output path

## From inline data

For quick charts without a file. Use `--labels` and `--values`:

```bash
chart bar --labels "Jan,Feb,Mar" --values "100,200,150" --title "Sales"
chart pie --labels "Chrome,Firefox,Safari" --values "65,20,15" --title "Browsers"
chart line --labels "Q1,Q2,Q3,Q4" --series '{"Revenue":[100,200,150,250],"Cost":[80,120,100,180]}'
```

Note: `scatter` does not support inline mode — it always requires a CSV file.

## Common pipeline: table query → chart → present

This is the typical workflow for data analysis:

```bash
# Step 1: Aggregate data from a spreadsheet
table query /input/sales.xlsx \
  --select "region, sum(revenue) as Revenue, count() as Orders" \
  --group "region" --sort "Revenue desc" \
  --output /output/by-region.csv

# Step 2: Create chart from the aggregated CSV
chart bar /output/by-region.csv --x "region" --y "Revenue" --title "Revenue by Region"

# Step 3: Display inline with download button
present /output/bar-chart.svg
```

### Scatter example with calc():

```bash
table query /input/data.xlsx \
  --select "customer, count() as Frequency, sum(amount) as Volume" \
  --group "customer" --limit 20 \
  --output /output/segments.csv

chart scatter /output/segments.csv --x "Frequency" --y "Volume" --label "customer" --title "Customer Segmentation"
present /output/scatter-chart.svg
```

## Important

- **Always use CSV file input** when data comes from `table query`. Do not manually copy values.
- Output is SVG, saved to `/output/` by default.
- Always call `present` after generating a chart to display it inline.
- X-axis labels rotate automatically when there are many categories.
