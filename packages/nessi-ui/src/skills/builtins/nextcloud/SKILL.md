---
name: nextcloud
description: Nextcloud files, calendar, and Talk messages.
metadata:
  nessi:
    command: nextcloud
    enabled: true
---

# Nextcloud

## Important: local files vs. Nextcloud files

- **Local files** uploaded in the chat are at `/input/`. Use file tools or bash to work with them.
- **Nextcloud files** are at `/nextcloud/`. Only access this when the user explicitly mentions Nextcloud or refers to files stored there.

If unclear whether the user means a local upload or a Nextcloud file, **ask before assuming**. Never default to `/nextcloud/` for files the user uploaded in the chat.

## Files

Nextcloud files are at `/nextcloud/`. Just use normal commands:

```bash
ls /nextcloud/
cat /nextcloud/Documents/notes.md
table filter /nextcloud/data.xlsx --where "status = active" --output /output/result.csv
cp /output/result.csv /nextcloud/Documents/result.csv
```

## Calendar

```bash
nextcloud calendar
nextcloud calendar --days 14
nextcloud calendar --name work
nextcloud calendar create "Team standup" --start "2025-06-15 09:00" --end "2025-06-15 09:30"
nextcloud calendar create "Lunch" --start "2025-06-15 12:00" --calendar work --location "Cafeteria"
```

- `--end` defaults to 1 hour after start if omitted
- `--calendar` selects the calendar (default: "personal")
- `--location` and `--description` are optional
- Creating events requires user approval

## Talk

Use conversation names directly — no tokens needed.

```bash
nextcloud talk
nextcloud talk read "General"
nextcloud talk read "Anna" --limit 50
nextcloud talk send "General" "Hello everyone!"
```

- `nextcloud talk` — list all conversations
- `nextcloud talk read "name"` — read recent messages (fuzzy name match)
- `nextcloud talk send "name" "msg"` — send a message (asks user for approval first)
