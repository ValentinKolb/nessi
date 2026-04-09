import { PDFDocument } from "pdf-lib";
import { extractPdfText } from "./pdf-text.js";

export type PdfTextExport = {
  content: string;
  extension: string;
  mimeType: string;
};

const parsePageRange = (range: string, totalPages: number) => {
  const pages = new Set<number>();
  for (const part of range.split(",").map((item) => item.trim()).filter(Boolean)) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) {
      throw new Error(`Invalid page range: ${part}`);
    }
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < 1 || end < start) {
      throw new Error(`Invalid page range: ${part}`);
    }
    for (let page = start; page <= end; page += 1) {
      if (page > totalPages) {
        throw new Error(`Page ${page} is out of range. Document has ${totalPages} page(s).`);
      }
      pages.add(page - 1);
    }
  }
  return [...pages].sort((a, b) => a - b);
};

export const exportPdfText = async (bytes: Uint8Array, format: "txt" | "md" = "txt"): Promise<PdfTextExport> => {
  const text = await extractPdfText(bytes);
  if (format === "md") {
    return {
      content: `# PDF text\n\n${text}\n`,
      extension: "md",
      mimeType: "text/markdown",
    };
  }

  return {
    content: `${text}\n`,
    extension: "txt",
    mimeType: "text/plain",
  };
};

export const splitPdf = async (bytes: Uint8Array, pages: string) => {
  const source = await PDFDocument.load(bytes);
  const indices = parsePageRange(pages, source.getPageCount());
  if (indices.length === 0) {
    throw new Error("No pages selected.");
  }

  const next = await PDFDocument.create();
  const copied = await next.copyPages(source, indices);
  for (const page of copied) {
    next.addPage(page);
  }

  return await next.save();
};

export const mergePdfs = async (files: Uint8Array[]) => {
  if (files.length < 2) {
    throw new Error("Merge requires at least two PDF files.");
  }

  const next = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(file);
    const copied = await next.copyPages(source, source.getPageIndices());
    for (const page of copied) {
      next.addPage(page);
    }
  }

  return await next.save();
};
