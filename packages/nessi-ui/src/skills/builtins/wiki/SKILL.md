---
name: wiki
description: "Wikipedia article summaries and key facts. Use for factual lookups about people, places, events, or concepts — more reliable than guessing from training data."
metadata:
  nessi:
    command: wiki
    enabled: true
---

# Wiki

Look up facts from Wikipedia. Use this when you need authoritative information about people, places, events, companies, or concepts.

## Commands

### Summary

```bash
wiki Berlin
wiki "Albert Einstein"
wiki "Fibonacci sequence"
```

Returns a concise article summary (2-3 paragraphs) from Wikipedia.

### Search

```bash
wiki search "renewable energy Germany"
```

Returns a list of matching article titles.

### Language

By default, searches English Wikipedia. Use `--lang` for other languages:

```bash
wiki Berlin --lang de
wiki Tokyo --lang ja
```

## When to use

- User asks a factual question you're not 100% sure about
- You need current data about a place, person, or organization
- You want to cite a source: "According to Wikipedia, ..."
- The user explicitly asks "look that up" or "what is X?"

## Notes

- Data from Wikipedia REST API (free, no API key)
- Summaries are 2-3 paragraphs, not full articles
- Always cite Wikipedia as the source when using this data
