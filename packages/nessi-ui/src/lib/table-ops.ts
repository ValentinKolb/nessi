type TableFormat = "csv" | "xlsx";
type TableExportFormat = "csv" | "json" | "md";

export type TableInfo = {
  format: TableFormat;
  sheets: Array<{ name: string; rowCount: number; columnCount: number }>;
};

export type TableColumns = {
  sheet: string;
  columns: string[];
};

export type TablePreview = {
  sheet: string;
  columns: string[];
  rows: Array<Record<string, string>>;
};

export type TableExport = {
  sheet: string;
  content: string;
  extension: string;
  mimeType: string;
};

type ParsedSheet = {
  name: string;
  columns: string[];
  rows: Array<Record<string, string>>;
};

type ParsedWorkbook = {
  format: TableFormat;
  sheets: ParsedSheet[];
};

type XlsxModule = {
  read: (data: unknown, opts: Record<string, unknown>) => {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
  };
  utils: {
    sheet_to_json: (sheet: unknown, opts: Record<string, unknown>) => unknown[][];
  };
};

let xlsxPromise: Promise<XlsxModule> | null = null;

const getXlsx = () => {
  if (!xlsxPromise) {
    xlsxPromise = import("xlsx") as Promise<XlsxModule>;
  }
  return xlsxPromise;
};

const inferFormat = (filename: string): TableFormat =>
  filename.toLowerCase().endsWith(".csv") ? "csv" : "xlsx";

const normalizeCell = (value: unknown) => {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "string") return value.trim();
  return String(value).trim();
};

const normalizeHeaders = (raw: unknown[]) => {
  const seen = new Map<string, number>();
  return raw.map((value, index) => {
    const base = normalizeCell(value) || `column_${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
};

const toMarkdownTable = (columns: string[], rows: Array<Record<string, string>>) => {
  const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const header = `| ${columns.map(escape).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => escape(row[column] ?? "")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
};

const toCsv = (columns: string[], rows: Array<Record<string, string>>) => {
  const escape = (value: string) => {
    const normalized = value.replace(/\r\n/g, "\n");
    if (/[",\n]/.test(normalized)) {
      return `"${normalized.replace(/"/g, "\"\"")}"`;
    }
    return normalized;
  };

  const lines = [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((column) => escape(row[column] ?? "")).join(",")),
  ];
  return lines.join("\n");
};

const parseWorkbook = async (bytes: Uint8Array, filename: string): Promise<ParsedWorkbook> => {
  const XLSX = await getXlsx();
  const workbook = XLSX.read(bytes, { type: "array", raw: false, dense: true });
  const sheets: ParsedSheet[] = [];

  for (const sheetName of workbook.SheetNames as string[]) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" }) as unknown[][];
    const headerRow = matrix[0] ?? [];
    const columns = normalizeHeaders(headerRow);
    const rows = matrix
      .slice(1)
      .map((row) => {
        const record: Record<string, string> = {};
        for (let i = 0; i < columns.length; i += 1) {
          const column = columns[i];
          if (!column) continue;
          record[column] = normalizeCell(row?.[i]);
        }
        return record;
      })
      .filter((row) => Object.values(row).some((value) => value !== ""));

    sheets.push({ name: sheetName, columns, rows });
  }

  return {
    format: inferFormat(filename),
    sheets,
  };
};

const selectSheet = (workbook: ParsedWorkbook, preferred?: string) => {
  if (workbook.sheets.length === 0) {
    throw new Error("No readable sheets found.");
  }

  if (!preferred) return workbook.sheets[0]!;
  const sheet = workbook.sheets.find((entry) => entry.name === preferred);
  if (!sheet) {
    throw new Error(`Sheet not found: ${preferred}`);
  }
  return sheet;
};

const applyColumns = (sheet: ParsedSheet, requested?: string[]) => {
  if (!requested || requested.length === 0) return sheet;
  const missing = requested.filter((column) => !sheet.columns.includes(column));
  if (missing.length > 0) {
    throw new Error(`Unknown columns: ${missing.join(", ")}`);
  }

  return {
    ...sheet,
    columns: requested,
    rows: sheet.rows.map((row) => {
      const next: Record<string, string> = {};
      for (const column of requested) {
        next[column] = row[column] ?? "";
      }
      return next;
    }),
  };
};

const applyRows = (sheet: ParsedSheet, rows?: number) => {
  const limit = typeof rows === "number" && rows > 0 ? Math.floor(rows) : undefined;
  if (!limit) return sheet;
  return { ...sheet, rows: sheet.rows.slice(0, limit) };
};

export const getTableInfo = async (bytes: Uint8Array, filename: string): Promise<TableInfo> => {
  const workbook = await parseWorkbook(bytes, filename);
  return {
    format: workbook.format,
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.name,
      rowCount: sheet.rows.length,
      columnCount: sheet.columns.length,
    })),
  };
};

export const getTableColumns = async (bytes: Uint8Array, filename: string, sheetName?: string): Promise<TableColumns> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = selectSheet(workbook, sheetName);
  return { sheet: sheet.name, columns: sheet.columns };
};

export const getTablePreview = async (
  bytes: Uint8Array,
  filename: string,
  options: { sheet?: string; rows?: number; columns?: string[] } = {},
): Promise<TablePreview> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = applyRows(applyColumns(selectSheet(workbook, options.sheet), options.columns), options.rows ?? 20);
  return {
    sheet: sheet.name,
    columns: sheet.columns,
    rows: sheet.rows,
  };
};

export const exportTable = async (
  bytes: Uint8Array,
  filename: string,
  options: { format: TableExportFormat; sheet?: string; rows?: number; columns?: string[] },
): Promise<TableExport> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = applyRows(applyColumns(selectSheet(workbook, options.sheet), options.columns), options.rows);

  switch (options.format) {
    case "csv":
      return {
        sheet: sheet.name,
        content: toCsv(sheet.columns, sheet.rows),
        extension: "csv",
        mimeType: "text/csv",
      };
    case "json":
      return {
        sheet: sheet.name,
        content: JSON.stringify(sheet.rows, null, 2),
        extension: "json",
        mimeType: "application/json",
      };
    case "md":
      return {
        sheet: sheet.name,
        content: toMarkdownTable(sheet.columns, sheet.rows),
        extension: "md",
        mimeType: "text/markdown",
      };
  }
};
