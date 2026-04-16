import { readJson } from "./json-storage.js";

const STORAGE_KEY = "nessi:github";
const API_BASE = "https://api.github.com";

const getToken = () => {
  const raw = readJson<{ apiKey?: string } | null>(STORAGE_KEY, null);
  return typeof raw?.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : null;
};

const apiFetch = async (path: string, init?: RequestInit) => {
  const token = getToken();
  if (!token) throw new Error("GitHub token not configured. The user needs to add a Personal Access Token in Settings → API Keys → GitHub. They can create one at github.com/settings/tokens.");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body || res.statusText}`);
  }

  return res.json();
};

/** Whether a GitHub Personal Access Token is configured. */
export const hasGitHubToken = () => getToken() !== null;

/**
 * Download a repository as a ZIP archive (single request).
 * Uses the authenticated API when a token is available, otherwise falls back
 * to the public archive URL (works only for public repos).
 */
export const fetchGitHubZipball = async (
  owner: string,
  repo: string,
  ref?: string,
): Promise<Uint8Array> => {
  const token = getToken();

  if (token) {
    const apiPath = `/repos/${owner}/${repo}/zipball${ref ? `/${ref}` : ""}`;
    const res = await fetch(`${API_BASE}${apiPath}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        res.status === 404
          ? `Repository ${owner}/${repo} not found or token lacks access.`
          : `GitHub API ${res.status}: ${body || res.statusText}`,
      );
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  // No token – try the public archive URL (only works for public repos)
  const publicUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${ref || "main"}.zip`;
  const res = await fetch(publicUrl);
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? `Repository ${owner}/${repo} not found or is private. Add a GitHub token in Settings → API Keys.`
        : `Failed to download: ${res.status} ${res.statusText}`,
    );
  }
  return new Uint8Array(await res.arrayBuffer());
};

/** Lightweight reference to a GitHub entity selected by the user. */
export type GitHubRef = {
  id: string;
  kind: "file" | "dir" | "issue" | "pr";
  repo: string;
  path?: string;
  ref?: string;
  number?: number;
  title: string;
  state?: string;
};

export type GitHubApi = {
  fetch: (path: string) => Promise<unknown>;
};

export const githubApi: GitHubApi = {
  fetch: apiFetch,
};

/* ------------------------------------------------------------------ */
/*  Detail fetchers for prompt enrichment                             */
/* ------------------------------------------------------------------ */

type IssueDetail = {
  number: number;
  title: string;
  state: string;
  body: string | null;
  user: { login: string };
  labels: { name: string }[];
  comments: number;
  created_at: string;
};

type PRDetail = {
  number: number;
  title: string;
  state: string;
  body: string | null;
  draft: boolean;
  user: { login: string };
  head: { ref: string };
  base: { ref: string };
  additions: number;
  deletions: number;
  changed_files: number;
  merged_at: string | null;
  created_at: string;
};

/** Fetch issue details for prompt injection.  Returns null on failure. */
export const fetchIssueDetail = async (repo: string, number: number): Promise<IssueDetail | null> => {
  try {
    return (await apiFetch(`/repos/${repo}/issues/${number}`)) as IssueDetail;
  } catch {
    return null;
  }
};

/** Fetch PR details for prompt injection.  Returns null on failure. */
export const fetchPRDetail = async (repo: string, number: number): Promise<PRDetail | null> => {
  try {
    return (await apiFetch(`/repos/${repo}/pulls/${number}`)) as PRDetail;
  } catch {
    return null;
  }
};

/** Format an issue detail into a prompt-ready markdown block. */
export const formatIssueForPrompt = (detail: IssueDetail, repo: string): string => {
  const lines = [
    `### Issue #${detail.number}: ${detail.title}`,
    `**State:** ${detail.state} | **Author:** ${detail.user.login} | **Comments:** ${detail.comments}`,
  ];
  if (detail.labels.length > 0) {
    lines.push(`**Labels:** ${detail.labels.map((l) => l.name).join(", ")}`);
  }
  if (detail.body?.trim()) {
    const body = detail.body.trim();
    lines.push("", body.length > 2000 ? body.slice(0, 2000) + "\n\n*(truncated)*" : body);
  }
  lines.push("", `> Fetch full details with comments: \`github issue ${repo} ${detail.number}\``);
  return lines.join("\n");
};

/** Format a PR detail into a prompt-ready markdown block. */
export const formatPRForPrompt = (detail: PRDetail, repo: string): string => {
  const state = detail.merged_at ? "merged" : detail.draft ? "draft" : detail.state;
  const lines = [
    `### Pull Request #${detail.number}: ${detail.title}`,
    `**State:** ${state} | **Author:** ${detail.user.login} | **Branch:** ${detail.head.ref} → ${detail.base.ref}`,
    `**Changes:** +${detail.additions} -${detail.deletions} across ${detail.changed_files} files`,
  ];
  if (detail.body?.trim()) {
    const body = detail.body.trim();
    lines.push("", body.length > 2000 ? body.slice(0, 2000) + "\n\n*(truncated)*" : body);
  }
  lines.push("", `> Fetch full diff and review comments: \`github pr ${repo} ${detail.number}\``);
  return lines.join("\n");
};
