<p align="center">
  <img src="./public/logo.svg" alt="nessi" width="88" />
</p>

# nessi-ui

Browser-first reference UI for `nessi`.

`nessi-ui` is a local, single-user chat client built on top of `nessi-core` and `nessi-ai`. It runs fully in the browser, stores state in `localStorage`, and ships as a static Vite build.

## Features

- Chat UI with streaming assistant responses
- Provider configuration for OpenAI-compatible, Ollama, Anthropic, Mistral, and Gemini backends
- Editable skills and prompts from the settings UI
- In-browser tool runtime via `just-bash`
- Manual and automatic history compaction
- Optional image upload when the active provider supports images

## Local Development

From the monorepo root:

```bash
bun install
bun --filter nessi-ui dev
```

Production build:

```bash
bun --filter nessi-ui build
```

## Docker

`nessi-ui` depends on workspace packages from the same monorepo, so the Docker build context must be the repository root.

Build:

```bash
docker build -f packages/nessi-ui/Dockerfile -t nessi-ui .
```

Run:

```bash
docker run --rm -p 8080:8080 nessi-ui
```

### Dockerfile layout

The Dockerfile is multi-stage on purpose:

1. Install workspace dependencies once with Bun
2. Build the static Vite app from the monorepo sources
3. Serve the output from a small `nginx:alpine` runtime image

This keeps the runtime image small and avoids shipping the Bun toolchain in production.

## Notes

- The app is browser-local and single-user by design.
- Provider settings, prompts, memory, and chats live in `localStorage`.
- API keys are stored in the browser, so this is not a shared multi-user deployment target without additional hardening.

## Project Structure

```txt
src/
  components/
    chat/
    settings/
  lib/
    provider.ts
    prompts.ts
    skills.ts
    store.ts
    chat-storage.ts
    compaction.ts
  assets/
    prompts/
    skills/
  styles/
    global.css
  shims/
public/
  favicon.png
  logo.svg
```
