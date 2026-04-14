---
name: chart
description: Generate bar, line, or pie charts from data. Charts are displayed inline in the chat and downloadable as SVG.
metadata:
  nessi:
    command: chart
    enabled: true
---

# Chart

Use the `chart` command to create data visualizations.

Prefer this when the user wants to:
- visualize data as a bar, line, or pie chart
- compare values across categories
- show trends over time

## Commands

### Bar Chart

```bash
chart bar --labels "Jan,Feb,Mar" --values "100,200,150" --title "Sales"
chart bar --labels "A,B,C,D" --values "40,30,20,10"
```

### Line Chart

```bash
chart line --labels "Q1,Q2,Q3,Q4" --series '{"Revenue":[100,200,150,250],"Cost":[80,120,100,180]}' --title "Revenue vs Cost"
chart line --labels "Mon,Tue,Wed,Thu,Fri" --series '{"Visitors":[500,800,600,900,700]}'
```

### Pie Chart

```bash
chart pie --labels "Chrome,Firefox,Safari,Other" --values "65,20,10,5" --title "Browser Market Share"
```

## Notes

- Charts are rendered inline in the chat with a download button.
- Output format is SVG.
- Use `--output` to also save the SVG to a file.
- For line charts, `--series` is a JSON object mapping series names to value arrays.
- Labels and values are comma-separated strings.
