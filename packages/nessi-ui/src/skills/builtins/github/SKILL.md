---
name: github
description: "Read files, issues, and PRs from GitHub. Use this for ANY github.com URL or repo reference — never use web search for GitHub content."
metadata:
  nessi:
    command: github
    enabled: true
---

# GitHub

Access GitHub repositories, issues, and pull requests via API.
**Always use this skill instead of web search for any github.com content.**

## Reading Files

Files from any public repo (or private with token) are available at `/github/owner/repo/`:

```bash
ls /github/facebook/react/src/
cat /github/facebook/react/README.md
read_file /github/vercel/ai/src/index.ts
```

No setup required — files load on demand from the GitHub API.

## Issues

```bash
github issues owner/repo
github issues owner/repo --state closed --limit 5
github issue owner/repo 42
```

## Pull Requests

```bash
github prs owner/repo
github prs owner/repo --state closed --limit 5
github pr owner/repo 42
```

## Repository Info

```bash
github repo owner/repo
github repos octocat --sort stars --limit 10
github commits owner/repo --ref develop --limit 20
github tags owner/repo
github releases owner/repo --limit 5
```

## Search

```bash
github search "query" --in owner/repo
github search "query" --in username --type code
```

## Important

- When a user shares a GitHub URL like `https://github.com/owner/repo/blob/main/file.ts`, extract the owner, repo, and path, then use `cat /github/owner/repo/file.ts` or `read_file /github/owner/repo/file.ts`.
- **Do not** use the `web` command to scrape github.com — it will fail or return HTML. Always use this skill.
- All CLI commands use `owner/repo` format (e.g. `facebook/react`).
- If you get a token error, tell the user to add a GitHub token in Settings.
