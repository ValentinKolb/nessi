import { filesRepo, type ChatFileKind, type ChatFileMeta, type ChatFileSourceType, type PendingChatFile } from "../domains/files/index.js";
import { pprintBytes } from "@valentinkolb/stdlib";
import { files as stdlibFiles } from "@valentinkolb/stdlib/browser";
import { newId } from "./utils.js";

export type { ChatFileKind, ChatFileMeta, ChatFileSourceType, PendingChatFile } from "../domains/files/index.js";

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

const toArrayBuffer = (bytes: Uint8Array) =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const storageKey = (meta: Pick<ChatFileMeta, "chatId" | "id">) => `${meta.chatId}/${meta.id}`;

const fileExt = (name: string) => {
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot + 1).toLowerCase() : "";
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

const safeSegment = (segment: string) =>
  segment
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
  || "file";

const safePath = (path: string) =>
  path.split("/").map(safeSegment).filter(Boolean).join("/");

const uniqueMountPath = async (chatId: string, kind: ChatFileKind, name: string, excludeId?: string) => {
  const metas = (await listChatFiles(chatId)).filter((meta) => meta.kind === kind && meta.id !== excludeId);
  const baseDir = kind === "input" ? "/input" : "/output";
  const sanitized = safePath(name);
  const lastSlash = sanitized.lastIndexOf("/");
  const dir = lastSlash >= 0 ? sanitized.slice(0, lastSlash + 1) : "";
  const filename = lastSlash >= 0 ? sanitized.slice(lastSlash + 1) : sanitized;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";

  let candidate = `${baseDir}/${sanitized}`;
  let suffix = 2;
  const used = new Set(metas.map((meta) => meta.mountPath));
  while (used.has(candidate)) {
    candidate = `${baseDir}/${dir}${stem}-${suffix}${ext}`;
    suffix += 1;
  }
  return candidate;
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

export const listChatFiles = (chatId: string) => filesRepo.list(chatId);

export const getChatFileByPath = (chatId: string, mountPath: string) => filesRepo.getByPath(chatId, mountPath);

export const listInputFiles = (chatId: string) => filesRepo.listInput(chatId);

export const listOutputFiles = (chatId: string) => filesRepo.listOutput(chatId);

export const fileMetasForMessage = (chatId: string, seq: number) => filesRepo.refsForMessage(chatId, seq);

export const attachFilesToMessage = (chatId: string, seq: number, fileIds: string[]) =>
  filesRepo.attachToMessage(chatId, seq, fileIds);

export const clearMessageFileRefs = (chatId: string, seq: number) =>
  filesRepo.clearRefsAtOrAfter(chatId, seq);

export const putInputFile = async (chatId: string, pending: PendingChatFile) => {
  const pathName = pending.relativePath || pending.name;
  const meta: ChatFileMeta = {
    id: newId(),
    chatId,
    name: pending.name,
    mimeType: pending.mimeType || guessMimeTypeFromName(pending.name),
    size: pending.size,
    kind: "input",
    sourceType: pending.sourceType,
    mountPath: await uniqueMountPath(chatId, "input", pathName),
    createdAt: new Date().toISOString(),
  };

  const bytes = new Uint8Array(await pending.file.arrayBuffer());
  const store = await getBinaryStore();
  await store.write(storageKey(meta), bytes);
  await filesRepo.putMeta(meta);
  return meta;
};

export const putOutputFile = async (
  chatId: string,
  mountPath: string,
  data: Uint8Array,
  mimeType = guessMimeTypeFromName(mountPath),
) => {
  const existing = (await listOutputFiles(chatId)).find((meta) => meta.mountPath === mountPath);
  const meta: ChatFileMeta = existing ?? {
    id: newId(),
    chatId,
    name: mountPath.split("/").pop() || "output.txt",
    mimeType,
    size: data.byteLength,
    kind: "output",
    sourceType: "generated" satisfies ChatFileSourceType,
    mountPath,
    createdAt: new Date().toISOString(),
  };

  meta.mimeType = mimeType;
  meta.size = data.byteLength;

  const store = await getBinaryStore();
  await store.write(storageKey(meta), data);
  await filesRepo.putMeta(meta);
  return meta;
};

export const readChatFile = async (meta: Pick<ChatFileMeta, "chatId" | "id">) => {
  const store = await getBinaryStore();
  const bytes = await store.read(storageKey(meta));
  if (!bytes) throw new Error("File content not found.");
  return bytes;
};

export const removeChatFile = async (chatId: string, fileId: string) => {
  const target = (await listChatFiles(chatId)).find((meta) => meta.id === fileId);
  if (!target) return;

  const store = await getBinaryStore();
  await store.remove(storageKey(target));
  await filesRepo.removeMeta(chatId, fileId);
};

export const removeOutputFilesMissingFromPaths = async (chatId: string, mountPaths: Set<string>) => {
  const outputs = await listOutputFiles(chatId);
  for (const meta of outputs) {
    if (!mountPaths.has(meta.mountPath)) {
      await removeChatFile(chatId, meta.id);
    }
  }
};

export const downloadChatFile = async (meta: ChatFileMeta) => {
  const bytes = await readChatFile(meta);
  stdlibFiles.downloadFileFromContent(bytes, meta.name, meta.mimeType || "application/octet-stream");
};

export const downloadChatFileByPath = async (chatId: string, mountPath: string) => {
  const meta = await getChatFileByPath(chatId, mountPath);
  if (!meta) throw new Error(`File not found: ${mountPath}`);
  await downloadChatFile(meta);
};

export const deleteAllChatFiles = async (chatId: string) => {
  const metas = await listChatFiles(chatId);
  await Promise.all(metas.map((meta) => removeChatFile(chatId, meta.id)));
  await filesRepo.clearAllForChat(chatId);
};

const fileInfoLine = (meta: ChatFileMeta) =>
  `- ${meta.mountPath} (${meta.mimeType || meta.sourceType}, ${pprintBytes(meta.size)})`;

const fileSection = (title: string, items: ChatFileMeta[], limit = 15) => {
  if (items.length === 0) return [];
  const shown = items.slice(0, limit).map(fileInfoLine);
  const hidden = items.length - shown.length;
  return [
    `**${title}:**`,
    ...shown,
    ...(hidden > 0 ? [`- ... and ${hidden} more — run \`list_files /input\` to see all.`] : []),
    "",
  ];
};

export const buildFileInfo = (
  newFiles: ChatFileMeta[],
  allFiles: ChatFileMeta[],
  nextcloudRefs?: import("./nextcloud.js").NextcloudRef[],
  githubContext?: string,
) => {
  const inputFiles = allFiles.filter((meta) => meta.kind === "input");
  const outputFiles = allFiles.filter((meta) => meta.kind === "output");
  const hasLocalFiles = inputFiles.length > 0 || outputFiles.length > 0 || newFiles.length > 0;
  const hasNcRefs = nextcloudRefs && nextcloudRefs.length > 0;
  const hasGhContext = githubContext && githubContext.trim().length > 0;

  if (!hasLocalFiles && !hasNcRefs && !hasGhContext) return "";

  const lines: string[] = ["# Chat files", ""];

  if (hasLocalFiles) {
    lines.push(
      "The user has uploaded local files to this chat. They are available at `/input/`.",
      "Use file tools (read_file, list_files, etc.), bash, or your skills to process them.",
      "Write results to `/output/` and call `present` to show them inline with a direct download button.",
      "",
      "These are **local uploads** — not Nextcloud files. Only use `/nextcloud/` when the user explicitly mentions Nextcloud.",
      "",
    );

    if (newFiles.length > 0) {
      lines.push(...fileSection("New files in this message", newFiles));
    }

    lines.push(...fileSection("All input files", inputFiles));

    if (outputFiles.length > 0) {
      lines.push(...fileSection("Output files", outputFiles));
    }
  }

  if (hasNcRefs) {
    lines.push("The user has pointed to these Nextcloud paths for this message:");
    for (const ref of nextcloudRefs!) {
      const fullPath = `/nextcloud${ref.path}`;
      if (ref.isDir) {
        lines.push(`- ${fullPath} (folder)`);
      } else {
        lines.push(`- ${fullPath} (${ref.mime}, ${pprintBytes(ref.size)})`);
      }
    }
    lines.push(
      "",
      "Use file tools (read_file, list_files, etc.) or bash to access and process these Nextcloud files.",
      "",
    );
  }

  if (hasGhContext) {
    lines.push(githubContext!, "");
  }

  return lines.join("\n").trim();
};
