---
name: survey
description: Ask the user structured single-choice questions in one batch. Use this when you need specific inputs before proceeding.
metadata:
  nessi:
    command: survey
    enabled: true
---

# Survey

Run structured surveys with the `survey` command.

## Commands

### Ask (JSON format)

```bash
survey ask --json '{"title":"Language","questions":[{"question":"Preferred language?","options":["Deutsch","English"]}]}'
```

### Ask (shorthand, one question)

```bash
survey ask "Preferred language?" --options "Deutsch|English|Spanish" --title "Language"
```

## Notes

- This opens an interactive survey UI for the user.
- The command returns plain text question/answer pairs.
- Use this instead of asking many questions one by one.
