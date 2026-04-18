---
name: survey
description: "Interactive choice cards for user decisions. Always use instead of numbered option lists. One survey replaces 3-4 back-and-forth messages."
metadata:
  nessi:
    command: survey
    enabled: true
---

# Survey

Collect structured input from the user via an interactive survey card. The survey tool is a **direct tool** — call it by name, not via bash.

## When to use

- You need to decide between approaches before starting
- You want to present options — always use a survey instead of a numbered list in text
- You need 2+ pieces of input and asking one by one would be slow
- The user asks you to plan, recommend, or compare

Don't use when: simple yes/no (ask in text), or the user already gave all details.

## Format

The `questions` parameter uses **pipe format**: each line is `Question | Option A | Option B | ...`.

### Single choice (most common)

```json
{
  "title": "What to analyze?",
  "questions": "Analysis type | Revenue by region | Trends over time | Customer segmentation | All of the above"
}
```

### Multiple questions

```json
{
  "title": "Export Setup",
  "questions": "Format? | PDF | CSV | Markdown\nDetail level? | Summary | Detailed | Full data"
}
```

Separate multiple questions with `\n` (newline).

### Via bash (shorthand for single choice)

```bash
survey ask "Output format?" --options "PDF|Markdown|HTML" --title "Export"
```

## Rules

- Each line needs: `Question | Option1 | Option2` (at least 2 options)
- Keep options short and clear (3-6 per question)
- Use descriptive titles so the user knows what they're deciding
- The result is returned as plain text — use it directly in your next step
