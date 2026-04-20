import { localStorageJson } from "../../shared/storage/local-storage.js";

const STORAGE_KEY = "nessi:nextcloud";

type NextcloudConfig = { url?: string; user?: string; appPassword?: string };

/** Lightweight reference to a Nextcloud file or folder selected by the user. */
export type NextcloudRef = {
  id: string;
  /** Nextcloud-internal path, e.g. "/Documents/report.pdf" */
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  mime: string;
};

/** Check whether Nextcloud credentials are configured (non-throwing). */
export const isNextcloudConfigured = () => {
  const raw = localStorageJson.read<NextcloudConfig | null>(STORAGE_KEY, null);
  return Boolean(raw?.url?.trim() && raw?.user?.trim() && raw?.appPassword?.trim());
};

const getConfig = () => {
  const raw = localStorageJson.read<NextcloudConfig | null>(STORAGE_KEY, null);
  if (!raw?.url?.trim() || !raw?.user?.trim() || !raw?.appPassword?.trim()) {
    throw new Error("Nextcloud not configured. The user needs to add their Nextcloud URL, username, and app password in Settings → API Keys → Nextcloud.");
  }
  return {
    url: raw.url.trim().replace(/\/+$/, ""),
    user: raw.user.trim(),
    appPassword: raw.appPassword.trim(),
  };
};

const authHeader = (user: string, pass: string) =>
  `Basic ${btoa(`${user}:${pass}`)}`;

const davFetch = async (method: string, fullDavPath: string, body?: string, extraHeaders?: Record<string, string>) => {
  const c = getConfig();
  const url = `${c.url}${fullDavPath.startsWith("/") ? fullDavPath : `/${fullDavPath}`}`;
  const headers: Record<string, string> = {
    Authorization: authHeader(c.user, c.appPassword),
    ...(body ? { "Content-Type": "application/xml" } : {}),
    ...extraHeaders,
  };
  // PROPFIND and REPORT need Depth header
  if ((method === "PROPFIND" || method === "REPORT") && !headers.Depth) {
    headers.Depth = "1";
  }
  const res = await fetch(url, { method, headers, body });
  if (!res.ok && res.status !== 207) {
    throw new Error(`Nextcloud ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  }
  return res;
};

const filesPath = (path: string) => {
  const c = getConfig();
  return `/remote.php/dav/files/${c.user}${path.startsWith("/") ? path : `/${path}`}`;
};

const calPath = (path: string) => {
  const c = getConfig();
  return `/remote.php/dav/calendars/${c.user}${path.startsWith("/") ? path : `/${path}`}`;
};

export type NextcloudApi = {
  /** WebDAV on /remote.php/dav/files/{user}/... */
  webdav: (method: string, path: string, body?: string) => Promise<string>;
  /** CalDAV on /remote.php/dav/calendars/{user}/... */
  caldav: (method: string, path: string, body?: string, extraHeaders?: Record<string, string>) => Promise<string>;
  /** Download binary file from files DAV */
  downloadBinary: (path: string) => Promise<Uint8Array>;
  /** OCS REST API */
  ocs: (path: string, options?: { method?: string; body?: Record<string, unknown> }) => Promise<unknown>;
  user: () => string;
};

export const nextcloudApi: NextcloudApi = {
  webdav: async (method, path, body) => {
    const res = await davFetch(method, filesPath(path), body);
    return res.text();
  },

  caldav: async (method, path, body, extraHeaders) => {
    const res = await davFetch(method, calPath(path), body, extraHeaders);
    return res.text();
  },

  downloadBinary: async (path) => {
    const res = await davFetch("GET", filesPath(path));
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  },

  ocs: async (path, options) => {
    const c = getConfig();
    const url = `${c.url}/${path.startsWith("/") ? path.slice(1) : path}`;
    const method = options?.method ?? "GET";
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: authHeader(c.user, c.appPassword),
        "OCS-APIRequest": "true",
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      throw new Error(`Nextcloud OCS ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    return res.json();
  },

  user: () => getConfig().user,
};
