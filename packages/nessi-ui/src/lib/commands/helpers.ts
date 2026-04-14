import { exportPdfText, mergePdfs, splitPdf } from "../../skills/builtins/pdf/pdf-ops.js";
import { generateQrSvg } from "../qr.js";
import type { QrOptions } from "../qr.js";
import { barChart, lineChart, pieChart } from "../../skills/builtins/chart/chart.js";
import type { BarChartData, LineChartData, PieChartData } from "../../skills/builtins/chart/chart.js";
import { githubApi } from "../github.js";
import type { GitHubApi } from "../github.js";
import { nextcloudApi } from "../nextcloud.js";
import type { NextcloudApi } from "../nextcloud.js";
import {
  exportTable,
  getTableColumns,
  getTableInfo,
  getTablePreview,
  parseFilterExpr,
  tableAppendRows,
  tableFilter,
  tableReplaceValues,
  tableToCsv,
} from "../../skills/builtins/table/table-ops.js";
import type { FilterCondition, TableFilterResult, TableWriteResult } from "../../skills/builtins/table/table-ops.js";

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
    toCsv: (
      bytes: Uint8Array,
      filename: string,
      options?: { sheet?: string; columns?: string[]; rows?: number },
    ) => Promise<TableWriteResult>;
    appendRows: (
      bytes: Uint8Array,
      filename: string,
      newRows: Array<Record<string, string>>,
      options?: { sheet?: string },
    ) => Promise<TableWriteResult>;
    replaceValues: (
      bytes: Uint8Array,
      filename: string,
      column: string,
      oldValue: string,
      newValue: string,
      options?: { sheet?: string },
    ) => Promise<TableWriteResult>;
    filter: (
      bytes: Uint8Array,
      filename: string,
      conditions: FilterCondition[],
      options?: { sheet?: string; columns?: string[]; limit?: number },
    ) => Promise<TableFilterResult>;
    parseFilter: (expr: string) => FilterCondition;
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
  qr: {
    svg: (data: string, options?: QrOptions) => string;
  };
  chart: {
    bar: (data: BarChartData) => string;
    line: (data: LineChartData) => string;
    pie: (data: PieChartData) => string;
  };
  github: GitHubApi;
  nextcloud: NextcloudApi;
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
    toCsv: tableToCsv,
    appendRows: tableAppendRows,
    replaceValues: tableReplaceValues,
    filter: tableFilter,
    parseFilter: parseFilterExpr,
  },
  pdf: {
    text: exportPdfText,
    split: splitPdf,
    merge: mergePdfs,
  },
  qr: {
    svg: generateQrSvg,
  },
  chart: {
    bar: barChart,
    line: lineChart,
    pie: pieChart,
  },
  github: githubApi,
  nextcloud: nextcloudApi,
});
