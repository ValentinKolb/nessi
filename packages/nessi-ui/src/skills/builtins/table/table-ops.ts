import readXlsxFile from "read-excel-file/browser";

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

export type TableWriteResult = {
  content: string;
  extension: "csv";
  mimeType: "text/csv";
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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

const matrixToSheet = (name: string, matrix: unknown[][]): ParsedSheet => {
  const headerRow = matrix[0] ?? [];
  const columns = normalizeHeaders(headerRow);
  const rows = matrix
    .slice(1)
    .map((row) => {
      const record: Record<string, string> = {};
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        if (!col) continue;
        record[col] = normalizeCell(row[i]);
      }
      return record;
    })
    .filter((row) => Object.values(row).some((v) => v !== ""));

  return { name, columns, rows };
};

// ---------------------------------------------------------------------------
// CSV parser (RFC 4180)
// ---------------------------------------------------------------------------

const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      current.push(field);
      field = "";
    } else if (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) {
      if (ch === "\r") i++;
      current.push(field);
      field = "";
      rows.push(current);
      current = [];
    } else {
      field += ch;
    }
  }

  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }

  return rows;
};

// ---------------------------------------------------------------------------
// CSV / Markdown output
// ---------------------------------------------------------------------------

const toMarkdownTable = (columns: string[], rows: Array<Record<string, string>>) => {
  const escape = (value: string) => value.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const header = `| ${columns.map(escape).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((col) => escape(row[col] ?? "")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
};

const toCsv = (columns: string[], rows: Array<Record<string, string>>) => {
  const escape = (value: string) => {
    const normalized = value.replace(/\r\n/g, "\n");
    if (/[",\n]/.test(normalized)) return `"${normalized.replace(/"/g, '""')}"`;
    return normalized;
  };

  const lines = [
    columns.map(escape).join(","),
    ...rows.map((row) => columns.map((col) => escape(row[col] ?? "")).join(",")),
  ];
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Workbook parsing
// ---------------------------------------------------------------------------

const parseCsvWorkbook = (bytes: Uint8Array, filename: string): ParsedWorkbook => {
  const text = new TextDecoder().decode(bytes);
  const matrix = parseCsvRows(text);
  const name = filename.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Sheet1";
  return { format: "csv", sheets: [matrixToSheet(name, matrix)] };
};

const parseXlsxWorkbook = async (bytes: Uint8Array): Promise<ParsedWorkbook> => {
  const result = await readXlsxFile(bytes.buffer as ArrayBuffer);
  const sheets = result.map((entry: { sheet: string; data: unknown[][] }) =>
    matrixToSheet(entry.sheet, entry.data),
  );
  return { format: "xlsx", sheets };
};

const parseWorkbook = (bytes: Uint8Array, filename: string) =>
  inferFormat(filename) === "csv"
    ? Promise.resolve(parseCsvWorkbook(bytes, filename))
    : parseXlsxWorkbook(bytes);

// ---------------------------------------------------------------------------
// Sheet selection & filtering
// ---------------------------------------------------------------------------

const selectSheet = (workbook: ParsedWorkbook, preferred?: string) => {
  if (workbook.sheets.length === 0) throw new Error("No readable sheets found.");
  if (!preferred) return workbook.sheets[0]!;
  const sheet = workbook.sheets.find((s) => s.name === preferred);
  if (!sheet) throw new Error(`Sheet not found: ${preferred}`);
  return sheet;
};

const applyColumns = (sheet: ParsedSheet, requested?: string[]) => {
  if (!requested || requested.length === 0) return sheet;
  const missing = requested.filter((col) => !sheet.columns.includes(col));
  if (missing.length > 0) throw new Error(`Unknown columns: ${missing.join(", ")}`);

  return {
    ...sheet,
    columns: requested,
    rows: sheet.rows.map((row) => {
      const next: Record<string, string> = {};
      for (const col of requested) next[col] = row[col] ?? "";
      return next;
    }),
  };
};

const applyRows = (sheet: ParsedSheet, rows?: number) => {
  const limit = typeof rows === "number" && rows > 0 ? Math.floor(rows) : undefined;
  if (!limit) return sheet;
  return { ...sheet, rows: sheet.rows.slice(0, limit) };
};

// ---------------------------------------------------------------------------
// Read API (unchanged signatures)
// ---------------------------------------------------------------------------

export const getTableInfo = async (bytes: Uint8Array, filename: string): Promise<TableInfo> => {
  const workbook = await parseWorkbook(bytes, filename);
  return {
    format: workbook.format,
    sheets: workbook.sheets.map((s) => ({
      name: s.name,
      rowCount: s.rows.length,
      columnCount: s.columns.length,
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
  return { sheet: sheet.name, columns: sheet.columns, rows: sheet.rows };
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
      return { sheet: sheet.name, content: toCsv(sheet.columns, sheet.rows), extension: "csv", mimeType: "text/csv" };
    case "json":
      return { sheet: sheet.name, content: JSON.stringify(sheet.rows, null, 2), extension: "json", mimeType: "application/json" };
    case "md":
      return { sheet: sheet.name, content: toMarkdownTable(sheet.columns, sheet.rows), extension: "md", mimeType: "text/markdown" };
  }
};

// ---------------------------------------------------------------------------
// Write API
// ---------------------------------------------------------------------------

const csvResult = (content: string): TableWriteResult => ({
  content,
  extension: "csv",
  mimeType: "text/csv",
});

export const tableToCsv = async (
  bytes: Uint8Array,
  filename: string,
  options?: { sheet?: string; columns?: string[]; rows?: number },
): Promise<TableWriteResult> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = applyRows(applyColumns(selectSheet(workbook, options?.sheet), options?.columns), options?.rows);
  return csvResult(toCsv(sheet.columns, sheet.rows));
};

export const tableAppendRows = async (
  bytes: Uint8Array,
  filename: string,
  newRows: Array<Record<string, string>>,
  options?: { sheet?: string },
): Promise<TableWriteResult> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = selectSheet(workbook, options?.sheet);
  return csvResult(toCsv(sheet.columns, [...sheet.rows, ...newRows]));
};

export const tableReplaceValues = async (
  bytes: Uint8Array,
  filename: string,
  column: string,
  oldValue: string,
  newValue: string,
  options?: { sheet?: string },
): Promise<TableWriteResult> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = selectSheet(workbook, options?.sheet);
  if (!sheet.columns.includes(column)) throw new Error(`Unknown column: ${column}`);

  const updatedRows = sheet.rows.map((row) => ({
    ...row,
    [column]: row[column] === oldValue ? newValue : (row[column] ?? ""),
  }));
  return csvResult(toCsv(sheet.columns, updatedRows));
};

// ---------------------------------------------------------------------------
// Filter API
// ---------------------------------------------------------------------------

export type FilterOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "starts_with" | "matches";

export type FilterCondition = {
  column: string;
  op: FilterOp;
  value: string;
};

const OPS: Array<{ token: string; op: FilterOp }> = [
  { token: "!=", op: "!=" },
  { token: ">=", op: ">=" },
  { token: "<=", op: "<=" },
  { token: "=", op: "=" },
  { token: ">", op: ">" },
  { token: "<", op: "<" },
  { token: " contains ", op: "contains" },
  { token: " starts_with ", op: "starts_with" },
  { token: " matches ", op: "matches" },
];

export const parseFilterExpr = (expr: string): FilterCondition => {
  for (const { token, op } of OPS) {
    const idx = expr.indexOf(token);
    if (idx > 0) {
      return {
        column: expr.slice(0, idx).trim(),
        op,
        value: expr.slice(idx + token.length).trim(),
      };
    }
  }
  throw new Error(`Invalid filter: "${expr}". Use: column = value, column > 100, column contains text, column matches ^pat.*$`);
};

const regexCacheMap = new Map<string, RegExp>();
const regexCache = (pattern: string) => {
  let re = regexCacheMap.get(pattern);
  if (!re) {
    try { re = new RegExp(pattern, "i"); } catch (e) {
      throw new Error(`Invalid regex "${pattern}": ${e instanceof Error ? e.message : "syntax error"}`);
    }
    regexCacheMap.set(pattern, re);
  }
  return re;
};

const tryNum = (s: string) => { const n = Number(s); return isNaN(n) ? null : n; };
const tryDate = (s: string) => { const d = Date.parse(s); return isNaN(d) ? null : d; };

const matchRow = (row: Record<string, string>, cond: FilterCondition) => {
  const cell = row[cond.column] ?? "";
  const val = cond.value;

  if (cond.op === "contains") return cell.toLowerCase().includes(val.toLowerCase());
  if (cond.op === "starts_with") return cell.toLowerCase().startsWith(val.toLowerCase());
  if (cond.op === "matches") return regexCache(val).test(cell);
  if (cond.op === "=") return cell.toLowerCase() === val.toLowerCase();
  if (cond.op === "!=") return cell.toLowerCase() !== val.toLowerCase();

  // numeric / date comparison
  const cellNum = tryNum(cell);
  const valNum = tryNum(val);
  if (cellNum !== null && valNum !== null) {
    if (cond.op === ">") return cellNum > valNum;
    if (cond.op === "<") return cellNum < valNum;
    if (cond.op === ">=") return cellNum >= valNum;
    if (cond.op === "<=") return cellNum <= valNum;
  }
  const cellDate = tryDate(cell);
  const valDate = tryDate(val);
  if (cellDate !== null && valDate !== null) {
    if (cond.op === ">") return cellDate > valDate;
    if (cond.op === "<") return cellDate < valDate;
    if (cond.op === ">=") return cellDate >= valDate;
    if (cond.op === "<=") return cellDate <= valDate;
  }

  // fallback: string comparison
  if (cond.op === ">") return cell > val;
  if (cond.op === "<") return cell < val;
  if (cond.op === ">=") return cell >= val;
  if (cond.op === "<=") return cell <= val;
  return false;
};

export type TableFilterResult = TableWriteResult & { matchedRows: number; totalRows: number };

export const tableFilter = async (
  bytes: Uint8Array,
  filename: string,
  conditions: FilterCondition[],
  options?: { sheet?: string; columns?: string[]; limit?: number },
): Promise<TableFilterResult> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = selectSheet(workbook, options?.sheet);

  for (const cond of conditions) {
    if (!sheet.columns.includes(cond.column)) throw new Error(`Unknown column: ${cond.column}`);
    if (cond.op === "matches") regexCache(cond.value); // validate regex early
  }

  let filtered = sheet.rows.filter((row) => conditions.every((c) => matchRow(row, c)));
  const matchedRows = filtered.length;
  if (options?.limit && options.limit > 0) filtered = filtered.slice(0, options.limit);

  const cols = options?.columns?.length ? options.columns : sheet.columns;
  const projected = options?.columns?.length
    ? filtered.map((row) => { const r: Record<string, string> = {}; for (const c of cols) r[c] = row[c] ?? ""; return r; })
    : filtered;

  return {
    ...csvResult(toCsv(cols, projected)),
    matchedRows,
    totalRows: sheet.rows.length,
  };
};
