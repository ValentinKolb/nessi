<p align="center">
  <img src="./packages/nessi-ui/public/logo.svg" alt="nessi" width="96" />
</p>

# nessi

Minimal agent stack for provider adapters, an event-driven loop, and a browser UI.

The monorepo is intentionally split into three focused packages:

- `nessi-ai` for provider adapters
- `nessi-core` for the loop, tools, and stores
- `nessi-ui` for the browser client

## Packages

### `nessi-ai`

Unified provider layer with `complete()` and `stream()`.

```ts
import { openrouter } from "nessi-ai";

const provider = openrouter({
  model: "openai/gpt-4.1-mini",
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

### `nessi-core`

Minimal event-driven agent loop.

```ts
import { nessi, memoryStore } from "nessi-core";

const loop = nessi({
  provider,
  systemPrompt: "You are concise.",
  input: "Summarize this repo.",
  store: memoryStore(),
});
```

### `nessi-ui`

Browser-first reference client built on `nessi-core`.

```bash
bun install
bun --filter nessi-ui dev
```

## Development

Install dependencies once:

```bash
bun install
```

Useful commands from the repository root:

```bash
bun run typecheck
bun run test
bun run dev
bun run build
```

## Repository Layout

```txt
packages/
  nessi-ai/    Provider adapters and provider-facing types
  nessi-core/  Agent loop, tools, stores, compaction
  nessi-ui/    Browser UI, settings, local persistence, Docker setup
```

## Skills

This repo also ships standalone AI coding skills (e.g. structured workflows, prompting strategies) that work with any Claude Code project.

```bash
bunx skills add https://github.com/ValentinKolb/nessi
```

## Notes

- `nessi-ai` and `nessi-core` are the reusable libraries.
- `nessi-ui` is the reference application.
- The UI Docker build lives at [`packages/nessi-ui/Dockerfile`](./packages/nessi-ui/Dockerfile).
