import type { Bash } from "just-bash";
import {
  getChatFileByPath,
  listInputFiles,
  listOutputFiles,
  putOutputFile,
  readChatFile,
  type ChatFileMeta,
} from "./chat-files.js";
import { extractPdfText } from "../skills/builtins/pdf/pdf-text.js";

const DEFAULT_READ_LIMIT = 200;
const MAX_READ_LIMIT = 400;
const READ_ROOTS = ["/input", "/output", "/nextcloud", "/github"];
const WRITE_ROOTS = ["/output"];

export type FileListScope = "input" | "output" | "all";

export type FileListEntry = {
  path: string;
  name: string;
  kind: "input" | "output";
  mimeType: string;
  size: number;
  createdAt: string;
};

export type ReadFileResult = {
  path: string;
  mimeType: string;
  content: string;
  totalLines: number;
  linesReturned: number;
  truncated: boolean;
};

export type WriteFileResult = {
  path: string;
  bytesWritten: number;
  created: boolean;
};

export type EditFileResult = {
  sourcePath: string;
  outputPath: string;
  replacements: number;
};

export type ChatFileService = {
  list(scope?: FileListScope): Promise<{ files: FileListEntry[]; counts: { input: number; output: number } }>;
  readBytes(path: string): Promise<{ mimeType: string; bytes: Uint8Array }>;
  read(path: string, offset?: number, limit?: number): Promise<ReadFileResult>;
  write(path: string, content: string, overwrite?: boolean): Promise<WriteFileResult>;
  edit(path: string, oldString: string, newString: string, replaceAll?: boolean, outputPath?: string): Promise<EditFileResult>;
};

const validateMountedPath = (path: string, allowedRoots: string[]) => {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) throw new Error(`Path must be absolute. Use ${allowedRoots.join(" or ")}.`);
  const normalized = trimmed.replace(/\/+/g, "/");
  if (normalized.includes("/../") || normalized.endsWith("/..")) {
    throw new Error("Path traversal is not allowed.");
  }
  if (!allowedRoots.some((root) => normalized === root || normalized.startsWith(`${root}/`))) {
    throw new Error(`Path must be under ${allowedRoots.join(" or ")}.`);
  }
  return normalized;
};

const dirname = (path: string) => {
  const idx = path.lastIndexOf("/");
  return idx > 0 ? path.slice(0, idx) : "/";
};

const basename = (path: string) =>
  path.split("/").filter(Boolean).pop() ?? "file.txt";

const ensureOutputDir = async (bash: Bash | null, outputPath: string) => {
  if (!bash) return;
  const dir = dirname(outputPath);
  if (dir === "/") return;
  await bash.fs.mkdir(dir, { recursive: true });
};

const toNumberedContent = (lines: string[], startLine: number) => {
  if (lines.length === 0) return "";
  return lines
    .map((line, index) => `${startLine + index} | ${line}`)
    .join("\n");
};

const splitLines = (text: string) => {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
};

/** Roots whose files live only in the bash VFS (not persisted in Dexie). */
const VFS_ONLY_ROOTS = ["/github", "/nextcloud"];
const isVfsOnlyPath = (p: string) =>
  VFS_ONLY_ROOTS.some((r) => p === r || p.startsWith(`${r}/`));

/** Best-effort MIME type from file extension. */
const EXT_MIME: Record<string, string> = {
  txt: "text/plain", md: "text/markdown", json: "application/json",
  xml: "text/xml", html: "text/html", css: "text/css", csv: "text/csv",
  tsv: "text/tab-separated-values", yaml: "text/yaml", yml: "text/yaml",
  toml: "text/toml", svg: "image/svg+xml", png: "image/png",
  jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xls: "application/vnd.ms-excel",
  js: "text/javascript", mjs: "text/javascript", cjs: "text/javascript",
  ts: "text/typescript", tsx: "text/typescript", jsx: "text/javascript",
  py: "text/x-python", rb: "text/x-ruby", rs: "text/x-rust",
  go: "text/x-go", java: "text/x-java", c: "text/x-c", cpp: "text/x-c++",
  h: "text/x-c", hpp: "text/x-c++", sh: "text/x-sh", bash: "text/x-sh",
};
const guessMimeType = (path: string) =>
  EXT_MIME[path.split(".").pop()?.toLowerCase() ?? ""] ?? "text/plain";

const readBytesFromMountedPath = async (chatId: string, path: string, bash: Bash | null) => {
  const meta = await getChatFileByPath(chatId, path);
  if (!meta) throw new Error(`File not found: ${path}`);

  if (bash) {
    try {
      if (await bash.fs.exists(path)) {
        return { meta, bytes: await bash.fs.readFileBuffer(path) };
      }
    } catch {
      // fall back to persisted store
    }
  }

  return { meta, bytes: await readChatFile(meta) };
};

export const createChatFileService = (options: {
  getChatId: () => string;
  getBash: () => Bash | null;
  onFilesChanged?: () => void;
}): ChatFileService => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const mirrorOutputToRuntime = async (path: string, content: string) => {
    const bash = options.getBash();
    if (!bash) return;
    await ensureOutputDir(bash, path);
    await bash.fs.writeFile(path, content, "utf8");
  };

  const readVfsBytes = async (path: string): Promise<{ mimeType: string; bytes: Uint8Array }> => {
    const bash = options.getBash();
    if (!bash) throw new Error("Filesystem not available.");
    if (!(await bash.fs.exists(path))) throw new Error(`File not found: ${path}`);
    return { mimeType: guessMimeType(path), bytes: await bash.fs.readFileBuffer(path) };
  };

  const readImpl = async (path: string, offset = 1, limit = DEFAULT_READ_LIMIT): Promise<ReadFileResult> => {
    const normalized = validateMountedPath(path, READ_ROOTS);
    const safeOffset = Math.max(1, Math.floor(offset));
    const safeLimit = Math.min(MAX_READ_LIMIT, Math.max(1, Math.floor(limit)));

    let mimeType: string;
    let bytes: Uint8Array;
    if (isVfsOnlyPath(normalized)) {
      ({ mimeType, bytes } = await readVfsBytes(normalized));
    } else {
      const result = await readBytesFromMountedPath(options.getChatId(), normalized, options.getBash());
      mimeType = result.meta.mimeType;
      bytes = result.bytes;
    }

    const text = mimeType === "application/pdf"
      ? await extractPdfText(bytes)
      : decoder.decode(bytes);

    const allLines = splitLines(text);
    const startIndex = Math.min(allLines.length, safeOffset - 1);
    const visibleLines = allLines.slice(startIndex, startIndex + safeLimit);

    return {
      path: normalized,
      mimeType,
      content: toNumberedContent(visibleLines, startIndex + 1),
      totalLines: allLines.length,
      linesReturned: visibleLines.length,
      truncated: startIndex + visibleLines.length < allLines.length,
    };
  };

  const writeImpl = async (path: string, content: string, overwrite = true): Promise<WriteFileResult> => {
    const normalized = validateMountedPath(path, WRITE_ROOTS);
    const chatId = options.getChatId();
    const existing = await getChatFileByPath(chatId, normalized);
    if (existing && !overwrite) {
      throw new Error(`File already exists: ${normalized}`);
    }

    const bytes = encoder.encode(content);
    await putOutputFile(chatId, normalized, bytes);
    await mirrorOutputToRuntime(normalized, content);
    options.onFilesChanged?.();

    return {
      path: normalized,
      bytesWritten: bytes.byteLength,
      created: !existing,
    };
  };

  const editImpl = async (
    path: string,
    oldString: string,
    newString: string,
    replaceAll = false,
    outputPath?: string,
  ): Promise<EditFileResult> => {
    const sourcePath = validateMountedPath(path, READ_ROOTS);
    if (!oldString) throw new Error("oldString must not be empty.");

    const targetPath = outputPath
      ? validateMountedPath(outputPath, WRITE_ROOTS)
      : sourcePath.startsWith("/output/")
        ? sourcePath
        : `/output/${basename(sourcePath)}`;

    const { meta, bytes } = await readBytesFromMountedPath(options.getChatId(), sourcePath, options.getBash());
    if (meta.mimeType === "application/pdf") {
      throw new Error("PDF files cannot be edited directly. Extract them first or write a new text file under /output.");
    }

    const original = decoder.decode(bytes);
    const replacements = replaceAll ? original.split(oldString).length - 1 : (original.includes(oldString) ? 1 : 0);
    if (replacements === 0) {
      throw new Error(`oldString not found in ${sourcePath}.`);
    }

    const nextContent = replaceAll
      ? original.split(oldString).join(newString)
      : original.replace(oldString, newString);

    await writeImpl(targetPath, nextContent, true);
    return {
      sourcePath,
      outputPath: targetPath,
      replacements,
    };
  };

  return {
    async list(scope = "all") {
      const chatId = options.getChatId();
      const [input, output] = await Promise.all([
        listInputFiles(chatId),
        listOutputFiles(chatId),
      ]);

      const files = [
        ...(scope === "output" ? [] : input),
        ...(scope === "input" ? [] : output),
      ].map((file) => ({
        path: file.mountPath,
        name: file.name,
        kind: file.kind,
        mimeType: file.mimeType,
        size: file.size,
        createdAt: file.createdAt,
      }));

      return {
        files,
        counts: { input: input.length, output: output.length },
      };
    },
    async readBytes(path) {
      const normalized = validateMountedPath(path, READ_ROOTS);

      // VFS-only paths (GitHub clones, Nextcloud files): read from bash VFS
      if (isVfsOnlyPath(normalized)) {
        return readVfsBytes(normalized);
      }

      const { meta, bytes } = await readBytesFromMountedPath(options.getChatId(), normalized, options.getBash());
      return { mimeType: meta.mimeType, bytes };
    },
    read: readImpl,
    write: writeImpl,
    edit: editImpl,
  };
};
