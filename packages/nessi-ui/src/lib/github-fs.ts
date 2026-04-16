/**
 * IFileSystem implementation backed by the GitHub Contents API.
 *
 * Mounted at `/github/` via fs proxy.  Any path matching
 * `/github/{owner}/{repo}/...` is resolved on demand against the
 * GitHub API — no upfront setup or cloning required.
 */

import type { IFileSystem, FsStat } from "just-bash";
import { githubApi } from "./github.js";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type GhEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  sha: string;
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

const DIR_CACHE_TTL = 60_000;

const normalize = (path: string) => {
  const p = path.replace(/\/+/g, "/");
  return p === "/" ? "/" : p.replace(/\/$/, "");
};

type ParsedPath = { owner: string; repo: string; repoPath: string };

/** Extract owner, repo and inner path from `/owner/repo/rest/...`. */
const parsePath = (path: string): ParsedPath | null => {
  const parts = normalize(path).replace(/^\//, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1], repoPath: parts.slice(2).join("/") };
};

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const dirStat = (): FsStat => ({
  isFile: false,
  isDirectory: true,
  isSymbolicLink: false,
  mode: 0o755,
  size: 0,
  mtime: new Date(),
});

/* ------------------------------------------------------------------ */
/*  Factory                                                           */
/* ------------------------------------------------------------------ */

export const createGitHubFs = (): IFileSystem => {
  const dirCache = new Map<string, { entries: GhEntry[]; ts: number }>();

  const contentsUrl = (p: ParsedPath) => {
    const base = `/repos/${p.owner}/${p.repo}/contents/${p.repoPath}`;
    return base;
  };

  const listDir = async (p: ParsedPath): Promise<GhEntry[]> => {
    const cacheKey = `${p.owner}/${p.repo}/${p.repoPath}`;
    const cached = dirCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < DIR_CACHE_TTL) return cached.entries;

    const data = (await githubApi.fetch(contentsUrl(p))) as GhEntry[];
    if (!Array.isArray(data)) throw new Error("Expected directory listing");
    dirCache.set(cacheKey, { entries: data, ts: Date.now() });
    return data;
  };

  const findEntry = async (p: ParsedPath): Promise<GhEntry | null> => {
    if (!p.repoPath) return { name: p.repo, path: "", type: "dir", size: 0, sha: "" };
    const parentPath = p.repoPath.includes("/") ? p.repoPath.slice(0, p.repoPath.lastIndexOf("/")) : "";
    const name = p.repoPath.split("/").pop()!;
    try {
      const entries = await listDir({ ...p, repoPath: parentPath });
      return entries.find((e) => e.name === name) ?? null;
    } catch {
      return null;
    }
  };

  const fetchFileContent = async (p: ParsedPath): Promise<{ content: string; bytes: Uint8Array }> => {
    const data = (await githubApi.fetch(contentsUrl(p))) as { content?: string; encoding?: string };
    if (Array.isArray(data)) throw new Error(`EISDIR: illegal operation on a directory, read '${p.repoPath}'`);
    if (data.encoding === "base64" && data.content) {
      const bytes = base64ToBytes(data.content);
      return { content: new TextDecoder().decode(bytes), bytes };
    }
    throw new Error(`Cannot decode file: ${p.repoPath}`);
  };

  /* ---- IFileSystem ---- */

  const fs: IFileSystem = {
    async readFile(path) {
      const p = parsePath(path);
      if (!p) throw new Error(`ENOENT: '${path}' — use /owner/repo/path format`);
      const { content } = await fetchFileContent(p);
      return content;
    },

    async readFileBuffer(path) {
      const p = parsePath(path);
      if (!p) throw new Error(`ENOENT: '${path}' — use /owner/repo/path format`);
      const { bytes } = await fetchFileContent(p);
      return bytes;
    },

    async writeFile() {
      throw new Error("GitHub repositories are read-only. Write to /output instead.");
    },

    async appendFile() {
      throw new Error("GitHub repositories are read-only. Write to /output instead.");
    },

    async exists(path) {
      const n = normalize(path);
      // Virtual roots (/, /owner, /owner/repo) always exist optimistically
      const depth = n === "/" ? 0 : n.replace(/^\//, "").split("/").length;
      if (depth <= 2) return true;
      const p = parsePath(path);
      if (!p) return false;
      return (await findEntry(p)) !== null;
    },

    async stat(path): Promise<FsStat> {
      const n = normalize(path);
      const depth = n === "/" ? 0 : n.replace(/^\//, "").split("/").length;
      // /, /owner, /owner/repo are virtual directories
      if (depth <= 2) return dirStat();
      const p = parsePath(path);
      if (!p) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
      const entry = await findEntry(p);
      if (!entry) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
      return {
        isFile: entry.type === "file",
        isDirectory: entry.type === "dir",
        isSymbolicLink: false,
        mode: entry.type === "dir" ? 0o755 : 0o644,
        size: entry.size,
        mtime: new Date(),
      };
    },

    async lstat(path) {
      return fs.stat(path);
    },

    async readdir(path) {
      const n = normalize(path);
      const depth = n === "/" ? 0 : n.replace(/^\//, "").split("/").length;
      // Can't enumerate all GitHub owners or repos — return empty
      if (depth < 2) return [];
      const p = parsePath(path);
      if (!p) return [];
      const entries = await listDir(p);
      return entries.map((e) => e.name);
    },

    async mkdir() {
      throw new Error("GitHub repositories are read-only.");
    },

    async rm() {
      throw new Error("GitHub repositories are read-only.");
    },

    async cp() {
      throw new Error("GitHub repositories are read-only. Use cat to read, then write_file to save under /output.");
    },

    async mv() {
      throw new Error("GitHub repositories are read-only.");
    },

    resolvePath(base, path) {
      if (path.startsWith("/")) return normalize(path);
      return normalize(`${base}/${path}`);
    },

    getAllPaths() {
      return [];
    },

    async chmod() { /* no-op */ },
    async symlink() { throw new Error("Symlinks not supported on GitHub"); },
    async link() { throw new Error("Hard links not supported on GitHub"); },
    async readlink() { throw new Error("Symlinks not supported on GitHub"); },
    async realpath(path) { return normalize(path); },
    async utimes() { /* no-op */ },
  };

  return fs;
};
