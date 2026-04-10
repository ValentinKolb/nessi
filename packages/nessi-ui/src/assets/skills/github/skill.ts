// @ts-nocheck
export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;

  const gh = helpers.github;

  const REPO_HINT = 'Must be in "owner/repo" format, e.g. "facebook/react".';

  const parseRepo = (args) => {
    const raw = positionalArgs(args)[0];
    if (!raw) return { error: `Missing repository. ${REPO_HINT}` };
    if (!raw.includes("/")) return { error: `"${raw}" is not a valid repository. ${REPO_HINT}` };
    const [owner, repo] = raw.split("/");
    if (!owner || !repo) return { error: `"${raw}" is not a valid repository. ${REPO_HINT}` };
    return { owner, repo, full: raw, error: null };
  };

  const fmt = (obj) => JSON.stringify(obj, null, 2);

  const formatIssue = (i) =>
    `#${i.number} [${i.state}] ${i.title}\n  by ${i.user?.login ?? "?"} · ${i.created_at?.slice(0, 10)} · ${i.comments ?? 0} comments${i.labels?.length ? `\n  labels: ${i.labels.map((l) => l.name).join(", ")}` : ""}`;

  const formatPr = (p) =>
    `#${p.number} [${p.state}${p.draft ? "/draft" : ""}] ${p.title}\n  by ${p.user?.login ?? "?"} · ${p.created_at?.slice(0, 10)} · ${p.head?.ref ?? "?"} → ${p.base?.ref ?? "?"}`;

  return cli({ name: "github", description: "Browse GitHub repos, issues, PRs, and files" })

    // ── repos list ──
    .sub({
      name: "repos",
      usage: 'repos <user> [--sort updated|stars|name] [--limit 30]',
      async handler(args) {
        const user = positionalArgs(args)[0];
        if (!user) return err('Missing username. Example: github repos octocat');
        const opts = parseArgs(args);
        const sort = opts.get("sort") ?? "updated";
        const limit = parseInt(opts.get("limit") ?? "30", 10) || 30;
        try {
          const data = await gh.fetch(`/users/${user}/repos?sort=${sort}&per_page=${limit}`);
          if (!data.length) return ok(`No public repos found for "${user}".\n`);
          const lines = data.map((r) => {
            const meta = [r.language, `★${r.stargazers_count}`].filter(Boolean).join(" · ");
            return `${r.full_name}${r.private ? " (private)" : ""}${r.fork ? " (fork)" : ""}\n  ${r.description ?? "(no description)"}\n  ${meta} · updated ${r.updated_at?.slice(0, 10)}`;
          });
          return ok(lines.join("\n\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch repos.");
        }
      },
    })

    // ── repo ──
    .sub({
      name: "repo",
      usage: "repo <owner/repo>",
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        try {
          const data = await gh.fetch(`/repos/${r.full}`);
          const lines = [
            `${data.full_name}${data.private ? " (private)" : ""}`,
            data.description ?? "",
            "",
            `Stars: ${data.stargazers_count} · Forks: ${data.forks_count} · Issues: ${data.open_issues_count}`,
            `Language: ${data.language ?? "?"}`,
            `Default branch: ${data.default_branch}`,
            `Created: ${data.created_at?.slice(0, 10)} · Updated: ${data.updated_at?.slice(0, 10)}`,
            data.homepage ? `Homepage: ${data.homepage}` : "",
          ];
          return ok(lines.filter(Boolean).join("\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch repo.");
        }
      },
    })

    // ── tags ──
    .sub({
      name: "tags",
      usage: 'tags <owner/repo> [--limit 10]',
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const opts = parseArgs(args);
        const limit = parseInt(opts.get("limit") ?? "10", 10) || 10;
        try {
          const data = await gh.fetch(`/repos/${r.full}/tags?per_page=${limit}`);
          if (!data.length) return ok("No tags found.\n");
          const lines = data.map((t) => `${t.name}  (${t.commit?.sha?.slice(0, 7) ?? "?"})`);
          return ok(lines.join("\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch tags.");
        }
      },
    })

    // ── releases ──
    .sub({
      name: "releases",
      usage: 'releases <owner/repo> [--limit 5]',
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const opts = parseArgs(args);
        const limit = parseInt(opts.get("limit") ?? "5", 10) || 5;
        try {
          const data = await gh.fetch(`/repos/${r.full}/releases?per_page=${limit}`);
          if (!data.length) return ok("No releases found.\n");
          const lines = data.map((rel) => {
            const tag = rel.tag_name ?? "?";
            const date = rel.published_at?.slice(0, 10) ?? rel.created_at?.slice(0, 10) ?? "?";
            const pre = rel.prerelease ? " (pre-release)" : "";
            const draft = rel.draft ? " (draft)" : "";
            return `${tag}${pre}${draft}  ${date}  by ${rel.author?.login ?? "?"}\n  ${rel.name ?? "(no title)"}`;
          });
          return ok(lines.join("\n\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch releases.");
        }
      },
    })

    // ── commits ──
    .sub({
      name: "commits",
      usage: 'commits <owner/repo> [--ref main] [--limit 10]',
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const opts = parseArgs(args);
        const limit = parseInt(opts.get("limit") ?? "10", 10) || 10;
        const ref = opts.get("ref");
        const query = ref ? `&sha=${ref}` : "";
        try {
          const data = await gh.fetch(`/repos/${r.full}/commits?per_page=${limit}${query}`);
          if (!data.length) return ok("No commits found.\n");
          const lines = data.map((c) => {
            const sha = c.sha?.slice(0, 7) ?? "?";
            const date = c.commit?.author?.date?.slice(0, 10) ?? "?";
            const author = c.commit?.author?.name ?? c.author?.login ?? "?";
            const msg = (c.commit?.message ?? "").split("\n")[0];
            return `${sha}  ${date}  ${author}\n  ${msg}`;
          });
          return ok(lines.join("\n\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch commits.");
        }
      },
    })

    // ── issues list ──
    .sub({
      name: "issues",
      usage: 'issues <owner/repo> [--state open|closed|all] [--limit 20]',
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const opts = parseArgs(args);
        const state = opts.get("state") ?? "open";
        const limit = parseInt(opts.get("limit") ?? "20", 10) || 20;
        try {
          const data = await gh.fetch(`/repos/${r.full}/issues?state=${state}&per_page=${limit}&sort=updated`);
          const issues = data.filter((i) => !i.pull_request);
          if (issues.length === 0) return ok(`No ${state} issues found.\n`);
          return ok(issues.map(formatIssue).join("\n\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch issues.");
        }
      },
    })

    // ── issue detail ──
    .sub({
      name: "issue",
      usage: "issue <owner/repo> <number>",
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const num = positionalArgs(args)[1];
        if (!num) return err(`Missing issue number. Example: github issue ${r.full} 42`);
        try {
          const data = await gh.fetch(`/repos/${r.full}/issues/${num}`);
          const lines = [
            `#${data.number} [${data.state}] ${data.title}`,
            `by ${data.user?.login ?? "?"} · ${data.created_at?.slice(0, 10)}`,
            data.labels?.length ? `Labels: ${data.labels.map((l) => l.name).join(", ")}` : "",
            data.assignees?.length ? `Assignees: ${data.assignees.map((a) => a.login).join(", ")}` : "",
            "",
            data.body ?? "(no description)",
          ];
          return ok(lines.filter(Boolean).join("\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch issue.");
        }
      },
    })

    // ── PRs list ──
    .sub({
      name: "prs",
      usage: 'prs <owner/repo> [--state open|closed|all] [--limit 20]',
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const opts = parseArgs(args);
        const state = opts.get("state") ?? "open";
        const limit = parseInt(opts.get("limit") ?? "20", 10) || 20;
        try {
          const data = await gh.fetch(`/repos/${r.full}/pulls?state=${state}&per_page=${limit}&sort=updated`);
          if (data.length === 0) return ok(`No ${state} pull requests found.\n`);
          return ok(data.map(formatPr).join("\n\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch PRs.");
        }
      },
    })

    // ── PR detail ──
    .sub({
      name: "pr",
      usage: "pr <owner/repo> <number>",
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const num = positionalArgs(args)[1];
        if (!num) return err(`Missing PR number. Example: github pr ${r.full} 42`);
        try {
          const data = await gh.fetch(`/repos/${r.full}/pulls/${num}`);
          const lines = [
            `#${data.number} [${data.state}${data.draft ? "/draft" : ""}${data.merged ? "/merged" : ""}] ${data.title}`,
            `by ${data.user?.login ?? "?"} · ${data.created_at?.slice(0, 10)}`,
            `${data.head?.ref ?? "?"} → ${data.base?.ref ?? "?"}`,
            `+${data.additions ?? 0} / -${data.deletions ?? 0} · ${data.changed_files ?? 0} files`,
            data.labels?.length ? `Labels: ${data.labels.map((l) => l.name).join(", ")}` : "",
            "",
            data.body ?? "(no description)",
          ];
          return ok(lines.filter(Boolean).join("\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to fetch PR.");
        }
      },
    })

    // ── files list ──
    .sub({
      name: "files",
      usage: 'files <owner/repo> [--path src/lib] [--ref main]',
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const opts = parseArgs(args);
        const path = opts.get("path") ?? "";
        const ref = opts.get("ref") ?? "";
        const query = ref ? `?ref=${ref}` : "";
        try {
          const data = await gh.fetch(`/repos/${r.full}/contents/${path}${query}`);
          if (!Array.isArray(data)) return ok(`${data.name} (${data.type}, ${data.size} bytes)\n`);
          const lines = data.map((f) => {
            const icon = f.type === "dir" ? "📁" : "📄";
            return `${icon} ${f.name}${f.type === "file" ? ` (${f.size}b)` : ""}`;
          });
          return ok(lines.join("\n") + "\n");
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to list files.");
        }
      },
    })

    // ── file content ──
    .sub({
      name: "file",
      usage: "file <owner/repo> <path> [--ref main]",
      async handler(args) {
        const r = parseRepo(args);
        if (r.error) return err(r.error);
        const path = positionalArgs(args)[1];
        if (!path) return err(`Missing file path. Example: github file ${r.full} src/index.ts`);
        const opts = parseArgs(args);
        const ref = opts.get("ref") ?? "";
        const query = ref ? `?ref=${ref}` : "";
        try {
          const data = await gh.fetch(`/repos/${r.full}/contents/${path}${query}`);
          if (data.type !== "file") return err(`Not a file: ${path} (${data.type})`);
          if (data.size > 100_000) return err(`File too large (${data.size} bytes). Max 100KB.`);
          const content = atob(data.content?.replace(/\n/g, "") ?? "");
          return ok(`# ${data.path} (${data.size} bytes)\n\n${content}\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to read file.");
        }
      },
    })

    // ── search ──
    .sub({
      name: "search",
      usage: 'search "<query>" --in <owner/repo> [--type issues|code]',
      async handler(args) {
        const query = positionalArgs(args)[0];
        if (!query || !query.trim()) return err('Missing search query. Example: github search "bug fix" --in owner/repo');
        const opts = parseArgs(args);
        const scope = opts.get("in");
        if (!scope) return err('Missing --in flag. Example: github search "query" --in owner/repo (or --in username)');
        const type = opts.get("type") ?? "issues";
        if (type === "repo" || type === "repos" || type === "repositories") {
          return err('To list repos use "github repos <username>" instead of search.');
        }
        try {
          const scopeFilter = scope.includes("/") ? `repo:${scope}` : `user:${scope}`;
          const q = encodeURIComponent(`${query} ${scopeFilter}`);
          const data = await gh.fetch(`/search/${type === "code" ? "code" : "issues"}?q=${q}&per_page=20`);
          if (!data.items?.length) return ok("No results found.\n");

          if (type === "code") {
            const lines = data.items.map((i) => `${i.path}\n  ${i.repository?.full_name ?? ""}`);
            return ok(`${data.total_count} results:\n\n${lines.join("\n\n")}\n`);
          }

          const lines = data.items.map((i) => `#${i.number} [${i.state}] ${i.title}\n  by ${i.user?.login ?? "?"}`);
          return ok(`${data.total_count} results:\n\n${lines.join("\n\n")}\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Search failed.");
        }
      },
    });
}
