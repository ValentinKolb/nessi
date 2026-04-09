import { exportPdfText, mergePdfs, splitPdf } from "../pdf-ops.js";
import { exportTable, getTableColumns, getTableInfo, getTablePreview } from "../table-ops.js";

export type CommandHelpers = {
  requestApproval: (message: string) => Promise<boolean>;
  requestSurvey: (input: { title?: string; questions: Array<{ question: string; options: string[] }> }) => Promise<{ result: string }>;
  files: {
    readBytes: (path: string) => Promise<Uint8Array>;
  };
  table: {
    info: (bytes: Uint8Array, filename: string) => Promise<{
      format: "csv" | "xlsx";
      sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
    }>;
    columns: (bytes: Uint8Array, filename: string, sheetName?: string) => Promise<{
      sheet: string;
      columns: string[];
    }>;
    peek: (
      bytes: Uint8Array,
      filename: string,
      options?: { sheet?: string; rows?: number; columns?: string[] },
    ) => Promise<{
      sheet: string;
      columns: string[];
      rows: Array<Record<string, string>>;
    }>;
    export: (
      bytes: Uint8Array,
      filename: string,
      options: { format: "csv" | "json" | "md"; sheet?: string; rows?: number; columns?: string[] },
    ) => Promise<{
      sheet: string;
      content: string;
      extension: string;
      mimeType: string;
    }>;
  };
  pdf: {
    text: (bytes: Uint8Array, format?: "txt" | "md") => Promise<{
      content: string;
      extension: string;
      mimeType: string;
    }>;
    split: (bytes: Uint8Array, pages: string) => Promise<Uint8Array>;
    merge: (files: Uint8Array[]) => Promise<Uint8Array>;
  };
};

export const createCommandHelpers = (): CommandHelpers => ({
  requestApproval: async () => true,
  requestSurvey: async () => ({ result: "Survey unavailable in this runtime." }),
  files: {
    readBytes: async () => {
      throw new Error("File access unavailable in this runtime.");
    },
  },
  table: {
    info: getTableInfo,
    columns: getTableColumns,
    peek: getTablePreview,
    export: exportTable,
  },
  pdf: {
    text: exportPdfText,
    split: splitPdf,
    merge: mergePdfs,
  },
});
