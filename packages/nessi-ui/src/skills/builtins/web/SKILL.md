---
name: web
description: Search the internet and read web pages. Use this skill whenever the user asks about current events, news, prices, weather, facts you're unsure about, or anything that might have changed recently. Also use when the user shares a URL or asks you to look something up. When in doubt, search first — don't guess.
metadata:
  nessi:
    command: web
    enabled: true
---

# Web

Search the web and read pages with the `web` command.

## Commands

### Search

```bash
web search "your query"
web search "latest news" --max 3
web search "stock prices" --topic finance
```

Options:
- `--max N` — number of results (default: 5, max: 10)
- `--topic` — one of: general, news, finance (default: general)

### Read a web page

```bash
web extract https://example.com
web extract https://example.com https://other.com
```

Returns page content as markdown text. Max 5 URLs per call.

## When to use

Use web search when:
- The user asks about current information (news, prices, weather, events)
- You're not sure if your knowledge is up to date
- The user asks you to look something up or verify a fact
- The user shares a link — use `web extract` to read it

Don't use web search when:
- The answer is general knowledge that doesn't change (math, definitions, history)
- The user is asking for your opinion or help with a task (writing, planning, etc.)

## Tips

- Keep search queries short and specific — 2-5 words work best
- If the first search doesn't find what you need, try different keywords
- Use `--topic news` for recent events, `--topic finance` for market data
- After searching, summarize the results naturally — don't dump raw output
