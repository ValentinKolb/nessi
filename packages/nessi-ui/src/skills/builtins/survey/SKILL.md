---
name: survey
description: "Interactive choice cards for user decisions. Always use instead of numbered option lists. One survey replaces 3-4 back-and-forth messages."
metadata:
  nessi:
    command: survey
    enabled: true
---

# Survey

Collect structured input from the user via an interactive survey UI.

## When to use

Use a survey when:
- You need to decide between approaches before starting (language, format, detail level, audience)
- The user asks you to create something and there are reasonable design choices to make
- You need 2+ pieces of input and asking them one by one would be slow
- The user says "help me decide", "what do you recommend", or asks you to plan something
- You're about to start a multi-step task and want to confirm parameters upfront
- You want to present multiple options or proposals — a survey with clear choices is always better than a text list the user has to reply to
- The user wants to plan something (trip, project, event) — gather constraints and preferences in one go

Don't use a survey when:
- You only need one yes/no answer — just ask in text
- The user already gave you all the details you need — just do the task
- The answer is obvious from context or memories

## Commands

### Ask (JSON format — preferred for 2+ questions)

```bash
survey ask --json '{"title":"Project Setup","questions":[{"question":"Language?","options":["TypeScript","Python","Go"]},{"question":"Include tests?","options":["Yes","No"]}]}'
```

### Ask (shorthand — good for a single quick choice)

```bash
survey ask "Output format?" --options "PDF|Markdown|HTML" --title "Export"
```

## Notes

- Renders as an interactive card in chat — much better UX than text-based Q&A.
- Returns plain text question/answer pairs you can use directly.
- Keep options short and clear (3–6 per question is ideal).
- Use natural titles that tell the user what they're deciding.
