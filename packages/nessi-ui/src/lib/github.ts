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

export type GitHubApi = {
  fetch: (path: string) => Promise<unknown>;
};

export const githubApi: GitHubApi = {
  fetch: apiFetch,
};
