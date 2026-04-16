---
name: chart
description: "Generate bar, line, or pie charts — from CSV files or inline data. Use whenever data needs visualization: comparisons, trends, distributions. Charts render inline as SVG."
metadata:
  nessi:
    command: chart
    enabled: true
---

# Chart

Create data visualizations as SVG. Charts render inline in the chat with a download button.

## From CSV file (recommended)

Read data directly from a CSV file — no manual value copying needed:

```bash
chart bar /output/data.csv --x "region" --y "revenue" --title "Revenue by Region"
chart pie /output/data.csv --x "category" --y "amount" --title "Distribution"
chart line /output/data.csv --x "quarter" --y "revenue,cost,profit" --title "Trends"
```

- `--x` selects the label column (categories, time periods, names)
- `--y` selects the value column(s) — for line charts, use comma-separated columns for multiple series

## From inline data

For quick ad-hoc charts without a file:

```bash
chart bar --labels "Jan,Feb,Mar" --values "100,200,150" --title "Sales"
chart pie --labels "Chrome,Firefox,Safari" --values "65,20,15" --title "Browsers"
chart line --labels "Q1,Q2,Q3,Q4" --series '{"Revenue":[100,200,150,250],"Cost":[80,120,100,180]}'
```

## Full pipeline: table → chart

```bash
# 1. Aggregate data
table query /input/sales.xlsx \
  --select "region as Region, sum(revenue) as Revenue" \
  --group "region" --sort "Revenue desc" \
  --output /output/by-region.csv

# 2. Chart from aggregated CSV
chart bar /output/by-region.csv --x "Region" --y "Revenue" --title "Revenue by Region"

# 3. Display inline
present /output/bar-chart.svg
```

## Notes

- Output is SVG, saved to `/output/` by default.
- Use `--output /output/custom-name.svg` to override the filename.
- Use `present` to display the chart inline after generating it.
