/**
 * IFileSystem implementation backed by Nextcloud WebDAV.
 * Mounted at /nextcloud/ via fs proxy so all bash commands
 * (ls, cat, head, table, etc.) work transparently.
 */

import type { IFileSystem, FsStat, FileContent, MkdirOptions } from "just-bash";
import { createCache } from "@valentinkolb/stdlib";
import type { NextcloudApi } from "./nextcloud.js";

export const PROPFIND_BODY = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/><d:getcontentlength/><d:getlastmodified/><d:resourcetype/><d:getcontenttype/>
  </d:prop>
</d:propfind>`;

export type DavEntry = {
  name: string;
  href: string;
  isDir: boolean;
  size: number;
  mtime: Date;
  mime: string;
};

export const parsePropfind = (xml: string): DavEntry[] => {
  const entries: DavEntry[] = [];
  const responses = xml.split("<d:response>").slice(1);
  for (const r of responses) {
    const href = r.match(/<d:href>([^<]*)<\/d:href>/)?.[1] ?? "";
    const name = decodeURIComponent(href.split("/").filter(Boolean).pop() ?? "");
    const isDir = r.includes("<d:collection/>");
    const size = parseInt(r.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/)?.[1] ?? "0", 10);
    const modStr = r.match(/<d:getlastmodified>([^<]*)<\/d:getlastmodified>/)?.[1];
    const mime = r.match(/<d:getcontenttype>([^<]*)<\/d:getcontenttype>/)?.[1] ?? "application/octet-stream";
    if (name) entries.push({ name, href, isDir, size, mtime: modStr ? new Date(modStr) : new Date(), mime });
  }
  return entries;
};

export const createNextcloudFs = (api: NextcloudApi): IFileSystem => {
  const dirCache = createCache<DavEntry[]>({ ttl: 30_000 });

  const normalize = (path: string) => {
    const p = path.replace(/\/+/g, "/");
    return p === "/" ? "/" : p.replace(/\/$/, "");
  };

  const listDir = async (path: string) => {
    const key = normalize(path);
    const cached = await dirCache.get(key);
    if (cached) return cached;

    const davPath = key === "" ? "/" : key;
    const xml = await api.webdav("PROPFIND", davPath, PROPFIND_BODY);
    const all = parsePropfind(xml);
    const entries = all.slice(1);
    await dirCache.set(key, entries);
    return entries;
  };

  const findEntry = async (path: string): Promise<DavEntry | null> => {
    const n = normalize(path);
    if (n === "/" || n === "") return { name: "/", href: "/", isDir: true, size: 0, mtime: new Date(), mime: "" };
    const parent = n.slice(0, n.lastIndexOf("/")) || "/";
    const name = n.split("/").pop()!;
    try {
      const entries = await listDir(parent);
      return entries.find((e) => e.name === name) ?? null;
    } catch {
      return null;
    }
  };

  const invalidateDir = (path: string) => {
    const parent = normalize(path).slice(0, normalize(path).lastIndexOf("/")) || "/";
    dirCache.delete(parent);
    dirCache.delete(normalize(path));
  };

  const fs: IFileSystem = {
    async readFile(path) {
      const bytes = await api.downloadBinary(normalize(path));
      return new TextDecoder().decode(bytes);
    },

    async readFileBuffer(path) {
      return api.downloadBinary(normalize(path));
    },

    async writeFile(path, content) {
      const str = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
      await api.webdav("PUT", normalize(path), str);
      invalidateDir(path);
    },

    async appendFile(path, content) {
      let existing = "";
      try { existing = await fs.readFile(path); } catch { /* new file */ }
      const extra = content instanceof Uint8Array ? new TextDecoder().decode(content) : content;
      await fs.writeFile(path, existing + extra);
    },

    async exists(path) {
      return (await findEntry(path)) !== null;
    },

    async stat(path): Promise<FsStat> {
      const entry = await findEntry(path);
      if (!entry) throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
      return { isFile: !entry.isDir, isDirectory: entry.isDir, isSymbolicLink: false, mode: entry.isDir ? 0o755 : 0o644, size: entry.size, mtime: entry.mtime };
    },

    async lstat(path) { return fs.stat(path); },

    async mkdir(path, options) {
      if (options?.recursive) {
        const parts = normalize(path).split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
          current += `/${part}`;
          try { await api.webdav("MKCOL", current); } catch { /* exists */ }
        }
      } else {
        await api.webdav("MKCOL", normalize(path));
      }
      invalidateDir(path);
    },

    async readdir(path) {
      const entries = await listDir(normalize(path));
      return entries.map((e) => e.name);
    },

    async rm() {
      throw new Error("Deleting files on Nextcloud is not allowed. Please delete files manually through the Nextcloud web interface.");
    },

    async cp(src, dest) {
      const content = await fs.readFileBuffer(src);
      await fs.writeFile(dest, content);
    },

    async mv() {
      throw new Error("Moving or renaming files on Nextcloud is not allowed. Please manage files manually through the Nextcloud web interface.");
    },

    resolvePath(base, path) {
      if (path.startsWith("/")) return normalize(path);
      return normalize(`${base}/${path}`);
    },

    getAllPaths() { return []; },
    async chmod() { /* no-op */ },
    async symlink() { throw new Error("Symlinks not supported on Nextcloud"); },
    async link() { throw new Error("Hard links not supported on Nextcloud"); },
    async readlink() { throw new Error("Symlinks not supported on Nextcloud"); },
    async realpath(path) { return normalize(path); },
    async utimes() { /* no-op */ },
  };

  return fs;
};
