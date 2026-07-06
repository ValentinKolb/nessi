<p align="center">
  <img src="./packages/nessi-ui/public/logo.svg" alt="nessi" width="96" />
</p>

# nessi

Minimal agent stack for provider adapters, an event-driven loop, and a browser UI.

The monorepo is intentionally split into two focused packages:

- `@valentinkolb/nessi` for the published agent loop and provider API
- `nessi-ui` for the browser client

## Packages

### `@valentinkolb/nessi`

Agent loop at the package root, provider layer under `/ai`.

```ts
import { nessi, memoryStore } from "@valentinkolb/nessi";
import { openrouter } from "@valentinkolb/nessi/ai";

const provider = openrouter("openai/gpt-4.1-mini", {
  apiKey: process.env.OPENROUTER_API_KEY,
});

const loop = nessi({
  provider,
  systemPrompt: "You are concise.",
  input: "Summarize this repo.",
  store: memoryStore(),
});

for await (const event of loop) {
  if (event.type === "done") {
    console.log(event.aggregate?.usage);
    console.log(event.aggregate?.toolIssues);
  }
}
```

### `nessi-ui`

Browser-first reference client built on `@valentinkolb/nessi`.

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
  nessi/       Published package: agent loop plus /ai provider API
  nessi-ui/    Browser UI, settings, local persistence, Docker setup
```

## Skills

This repo also ships standalone AI coding skills (e.g. structured workflows, prompting strategies) that work with any Claude Code project.

```bash
bunx skills add https://github.com/ValentinKolb/nessi
```

## Notes

- `@valentinkolb/nessi` is the reusable library package.
- `nessi-ui` is the reference application.
- The UI Docker build lives at [`packages/nessi-ui/Dockerfile`](./packages/nessi-ui/Dockerfile).
