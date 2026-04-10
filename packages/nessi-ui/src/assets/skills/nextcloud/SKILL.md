---
name: nextcloud
description: Nextcloud files, calendar, and Talk messages.
metadata:
  nessi:
    command: nextcloud
    enabled: true
---

# Nextcloud

## Files

Files are at `/nextcloud/`. Just use normal commands:

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
```

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
