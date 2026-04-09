import { readJson, writeJson } from "./json-storage.js";
import { newId } from "./utils.js";

export type ChatFileKind = "input" | "output";
export type ChatFileSourceType = "text" | "pdf" | "table" | "generated";

export type ChatFileMeta = {
  id: string;
  chatId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatFileKind;
  sourceType: ChatFileSourceType;
  mountPath: string;
  createdAt: string;
};

export type PendingChatFile = {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  size: number;
  sourceType: Extract<ChatFileSourceType, "text" | "pdf" | "table">;
};

const CHAT_FILES_KEY = "nessi:chat-files:v1";
const MESSAGE_FILE_REFS_PREFIX = "nessi:chat-file-refs:";
const IDB_NAME = "nessi-chat-files";
const IDB_STORE = "files";

const TEXT_FILE_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "jsonl", "js", "jsx", "ts", "tsx", "mjs", "cjs",
  "html", "htm", "css", "scss", "less", "xml", "yml", "yaml", "toml", "ini", "conf", "log", "sh",
  "sql", "py", "rb", "php", "go", "rs", "java", "kt", "swift", "dart", "scala", "lua", "r", "pl",
  "c", "cc", "cpp", "h", "hpp", "cs", "zig", "env", "gitignore", "dockerfile", "makefile", "mk",
  "gradle", "lock", "mts", "cts",
]);

const TABLE_FILE_EXTENSIONS = new Set(["csv", "tsv", "xlsx", "xls"]);

type BinaryStore = {
  read: (storageKey: string) => Promise<Uint8Array | null>;
  write: (storageKey: string, data: Uint8Array) => Promise<void>;
  remove: (storageKey: string) => Promise<void>;
};

let binaryStorePromise: Promise<BinaryStore> | null = null;

const refsKey = (chatId: string) => `${MESSAGE_FILE_REFS_PREFIX}${chatId}`;

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const storageKey = (meta: Pick<ChatFileMeta, "chatId" | "id">) => `${meta.chatId}/${meta.id}`;

const loadAllMetas = () => {
  const raw = readJson<ChatFileMeta[]>(CHAT_FILES_KEY, []);
  return Array.isArray(raw) ? raw : [];
};

const saveAllMetas = (metas: ChatFileMeta[]) => {
  writeJson(CHAT_FILES_KEY, metas);
};

const loadRefs = (chatId: string) => readJson<Record<string, string[]>>(refsKey(chatId), {});

const saveRefs = (chatId: string, refs: Record<string, string[]>) => {
  writeJson(refsKey(chatId), refs);
};

const fileExt = (name: string) => {
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : "";
};

export const classifyPendingChatFile = (file: File): PendingChatFile | null => {
  const mimeType = file.type || guessMimeTypeFromName(file.name);
  const ext = fileExt(file.name);
  if (mimeType === "application/pdf" || ext === "pdf") {
    return {
      id: newId(),
      file,
      name: file.name,
      mimeType: "application/pdf",
      size: file.size,
      sourceType: "pdf",
    };
  }

  if (
    TABLE_FILE_EXTENSIONS.has(ext)
    || mimeType === "text/csv"
    || mimeType === "text/tab-separated-values"
    || mimeType === "application/vnd.ms-excel"
    || mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return {
      id: newId(),
      file,
      name: file.name,
      mimeType,
      size: file.size,
      sourceType: "table",
    };
  }

  if (
    mimeType.startsWith("text/")
    || mimeType === "application/json"
    || mimeType === "application/xml"
    || mimeType === "application/x-sh"
    || TEXT_FILE_EXTENSIONS.has(ext)
  ) {
    return {
      id: newId(),
      file,
      name: file.name,
      mimeType,
      size: file.size,
      sourceType: "text",
    };
  }

  return null;
};

const safeName = (name: string) =>
  name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
  || "file";

const uniqueMountPath = (chatId: string, kind: ChatFileKind, name: string, excludeId?: string) => {
  const metas = listChatFiles(chatId).filter((meta) => meta.kind === kind && meta.id !== excludeId);
  const baseDir = kind === "input" ? "/input" : "/output";
  const sanitized = safeName(name);
  const dot = sanitized.lastIndexOf(".");
  const stem = dot > 0 ? sanitized.slice(0, dot) : sanitized;
  const ext = dot > 0 ? sanitized.slice(dot) : "";

  let candidate = `${baseDir}/${sanitized}`;
  let suffix = 2;
  const used = new Set(metas.map((meta) => meta.mountPath));
  while (used.has(candidate)) {
    candidate = `${baseDir}/${stem}-${suffix}${ext}`;
    suffix += 1;
  }
  return candidate;
};

export const guessMimeTypeFromName = (name: string) => {
  const ext = fileExt(name);
  switch (ext) {
    case "pdf": return "application/pdf";
    case "json": return "application/json";
    case "csv": return "text/csv";
    case "tsv": return "text/tab-separated-values";
    case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "xls": return "application/vnd.ms-excel";
    case "md":
    case "markdown": return "text/markdown";
    case "html":
    case "htm": return "text/html";
    case "css": return "text/css";
    case "xml": return "application/xml";
    case "yaml":
    case "yml": return "application/yaml";
    default: return "text/plain";
  }
};

export const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

export const listChatFiles = (chatId: string) =>
  loadAllMetas()
    .filter((meta) => meta.chatId === chatId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const getChatFileByPath = (chatId: string, mountPath: string) =>
  listChatFiles(chatId).find((meta) => meta.mountPath === mountPath);

export const listInputFiles = (chatId: string) =>
  listChatFiles(chatId).filter((meta) => meta.kind === "input");

export const listOutputFiles = (chatId: string) =>
  listChatFiles(chatId).filter((meta) => meta.kind === "output");

export const fileMetasForMessage = (chatId: string, seq: number) => {
  const refs = loadRefs(chatId);
  const ids = refs[String(seq)] ?? [];
  if (ids.length === 0) return [];
  const byId = new Map(listChatFiles(chatId).map((meta) => [meta.id, meta] as const));
  return ids.map((id) => byId.get(id)).filter((meta): meta is ChatFileMeta => Boolean(meta));
};

export const attachFilesToMessage = (chatId: string, seq: number, fileIds: string[]) => {
  if (fileIds.length === 0) return;
  const refs = loadRefs(chatId);
  refs[String(seq)] = [...new Set(fileIds)];
  saveRefs(chatId, refs);
};

const removeFileRefs = (chatId: string, fileId: string) => {
  const refs = loadRefs(chatId);
  let changed = false;
  for (const key of Object.keys(refs)) {
    const next = (refs[key] ?? []).filter((id) => id !== fileId);
    if (next.length !== (refs[key] ?? []).length) {
      changed = true;
      if (next.length > 0) refs[key] = next;
      else delete refs[key];
    }
  }
  if (changed) saveRefs(chatId, refs);
};

const removeRefsAtOrAfter = (chatId: string, seq: number) => {
  const refs = loadRefs(chatId);
  let changed = false;
  for (const key of Object.keys(refs)) {
    if (Number(key) >= seq) {
      delete refs[key];
      changed = true;
    }
  }
  if (changed) saveRefs(chatId, refs);
};

const openIndexedDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB."));
  });

const createIndexedDbStore = (): BinaryStore => ({
  async read(key) {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value ? new Uint8Array(value as ArrayBuffer) : null);
      };
      req.onerror = () => reject(req.error ?? new Error("Failed to read file from IndexedDB."));
    });
  },
  async write(key, data) {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(toArrayBuffer(data), key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to write file to IndexedDB."));
    });
  },
  async remove(key) {
    const db = await openIndexedDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to remove file from IndexedDB."));
    });
  },
});

const createOpfsStore = (): BinaryStore => {
  const getRoot = async () => {
    const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    if (!storage.getDirectory) throw new Error("OPFS unavailable");
    return storage.getDirectory();
  };

  const getDirectory = async (chatId: string, create = false) => {
    const root = await getRoot();
    return root.getDirectoryHandle(chatId, { create });
  };

  return {
    async read(key) {
      const [chatId, fileId] = key.split("/", 2);
      if (!chatId || !fileId) return null;
      try {
        const dir = await getDirectory(chatId, false);
        const handle = await dir.getFileHandle(fileId, { create: false });
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch {
        return null;
      }
    },
    async write(key, data) {
      const [chatId, fileId] = key.split("/", 2);
      if (!chatId || !fileId) throw new Error("Invalid OPFS key.");
      const dir = await getDirectory(chatId, true);
      const handle = await dir.getFileHandle(fileId, { create: true });
      const writable = await handle.createWritable();
      await writable.write(toArrayBuffer(data));
      await writable.close();
    },
    async remove(key) {
      const [chatId, fileId] = key.split("/", 2);
      if (!chatId || !fileId) return;
      try {
        const dir = await getDirectory(chatId, false);
        await dir.removeEntry(fileId);
      } catch {
        // ignore missing entries
      }
    },
  };
};

const getBinaryStore = async () => {
  if (!binaryStorePromise) {
    binaryStorePromise = (async () => {
      try {
        const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
        if (storage.getDirectory) {
          await storage.getDirectory();
          return createOpfsStore();
        }
      } catch {
        // fall through
      }
      return createIndexedDbStore();
    })();
  }

  return binaryStorePromise;
};

export const putInputFile = async (chatId: string, pending: PendingChatFile) => {
  const meta: ChatFileMeta = {
    id: newId(),
    chatId,
    name: pending.name,
    mimeType: pending.mimeType || guessMimeTypeFromName(pending.name),
    size: pending.size,
    kind: "input",
    sourceType: pending.sourceType,
    mountPath: uniqueMountPath(chatId, "input", pending.name),
    createdAt: new Date().toISOString(),
  };

  const bytes = new Uint8Array(await pending.file.arrayBuffer());
  const store = await getBinaryStore();
  await store.write(storageKey(meta), bytes);

  saveAllMetas([...loadAllMetas(), meta]);
  return meta;
};

export const putOutputFile = async (
  chatId: string,
  mountPath: string,
  data: Uint8Array,
  mimeType = guessMimeTypeFromName(mountPath),
) => {
  const existing = listOutputFiles(chatId).find((meta) => meta.mountPath === mountPath);
  const meta: ChatFileMeta = existing ?? {
    id: newId(),
    chatId,
    name: mountPath.split("/").pop() || "output.txt",
    mimeType,
    size: data.byteLength,
    kind: "output",
    sourceType: "generated",
    mountPath,
    createdAt: new Date().toISOString(),
  };

  meta.mimeType = mimeType;
  meta.size = data.byteLength;

  const store = await getBinaryStore();
  await store.write(storageKey(meta), data);

  const metas = loadAllMetas();
  const index = metas.findIndex((entry) => entry.id === meta.id);
  if (index >= 0) metas[index] = meta;
  else metas.push(meta);
  saveAllMetas(metas);
  return meta;
};

export const readChatFile = async (meta: Pick<ChatFileMeta, "chatId" | "id">) => {
  const store = await getBinaryStore();
  const bytes = await store.read(storageKey(meta));
  if (!bytes) throw new Error("File content not found.");
  return bytes;
};

export const removeChatFile = async (chatId: string, fileId: string) => {
  const metas = loadAllMetas();
  const target = metas.find((meta) => meta.chatId === chatId && meta.id === fileId);
  if (!target) return;

  const store = await getBinaryStore();
  await store.remove(storageKey(target));
  saveAllMetas(metas.filter((meta) => meta.id !== fileId));
  removeFileRefs(chatId, fileId);
};

export const removeOutputFilesMissingFromPaths = async (chatId: string, mountPaths: Set<string>) => {
  const outputs = listOutputFiles(chatId);
  for (const meta of outputs) {
    if (!mountPaths.has(meta.mountPath)) {
      await removeChatFile(chatId, meta.id);
    }
  }
};

export const downloadChatFile = async (meta: ChatFileMeta) => {
  const bytes = await readChatFile(meta);
  const blob = new Blob([toArrayBuffer(bytes)], { type: meta.mimeType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = meta.name;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
};

export const deleteAllChatFiles = async (chatId: string) => {
  const metas = listChatFiles(chatId);
  await Promise.all(metas.map((meta) => removeChatFile(chatId, meta.id)));
  saveRefs(chatId, {});
};

export const clearMessageFileRefs = (chatId: string, seq: number) => {
  removeRefsAtOrAfter(chatId, seq);
};

const fileInfoLine = (meta: ChatFileMeta) =>
  `- ${meta.mountPath} (${meta.mimeType || meta.sourceType}, ${formatFileSize(meta.size)})`;

const section = (title: string, items: ChatFileMeta[], limit = 25) => {
  if (items.length === 0) return [title, "- none", ""];
  const shown = items.slice(0, limit).map(fileInfoLine);
  const hidden = items.length - shown.length;
  return [
    title,
    ...shown,
    ...(hidden > 0 ? [`- ... and ${hidden} more files`] : []),
    "",
  ];
};

export const buildFileInfo = (newFiles: ChatFileMeta[], allFiles: ChatFileMeta[]) => {
  const inputFiles = allFiles.filter((meta) => meta.kind === "input");
  const outputFiles = allFiles.filter((meta) => meta.kind === "output");
  return [
    "# File mounts",
    "",
    ...section("New files in this turn", newFiles),
    ...section("Mounted input files", inputFiles),
    ...section("Mounted output files", outputFiles),
  ].join("\n").trim();
};
