---
name: github
description: Browse GitHub repos, issues, PRs, and files.
metadata:
  nessi:
    command: github
    enabled: true
---

# GitHub

Use the `github` command to interact with GitHub repositories.

## Commands

### List Repos

```bash
github repos octocat
github repos octocat --sort stars --limit 10
```

### Repository Info

```bash
github repo owner/repo
```

### Tags & Releases

```bash
github tags owner/repo
github releases owner/repo --limit 5
```

### Commits

```bash
github commits owner/repo
github commits owner/repo --ref develop --limit 20
```

### Issues

```bash
github issues owner/repo
github issues owner/repo --state closed --limit 5
github issue owner/repo 42
```

### Pull Requests

```bash
github prs owner/repo
github prs owner/repo --state closed --limit 5
github pr owner/repo 42
```

### Files

```bash
github files owner/repo
github files owner/repo --path src/lib
github file owner/repo src/index.ts
```

### Search

```bash
github search "query" --in owner/repo
github search "query" --in username
github search "bug fix" --in owner/repo --type issues
github search "function handleClick" --in owner/repo --type code
```

`--in` accepts both `owner/repo` (search within a repo) or just `username` (search across all user repos).

## Notes

- All commands use the format `owner/repo` (e.g. `facebook/react`).
- Default state for issues/PRs is `open`.
- File content is returned as text (max 100KB).
- If you get a token error, tell the user to add their GitHub token in Settings → API Keys.
