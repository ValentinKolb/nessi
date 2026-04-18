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

// ---------------------------------------------------------------------------
// Query API (aggregation, projection, aliases)
// ---------------------------------------------------------------------------

export type AggFn = "count" | "sum" | "avg" | "min" | "max" | "median";

// ---------------------------------------------------------------------------
// Expression tree for calc()
// ---------------------------------------------------------------------------

type CalcNode =
  | { kind: "literal"; value: number }
  | { kind: "colRef"; name: string }
  | { kind: "aggRef"; fn: AggFn; column?: string }
  | { kind: "binOp"; op: "+" | "-" | "*" | "/"; left: CalcNode; right: CalcNode };

/** Tokenize a calc expression into numbers, identifiers, operators, and parens. */
const tokenize = (input: string): string[] => {
  const tokens: string[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (/\s/.test(ch)) { i++; continue; }
    if ("+-*/()".includes(ch)) { tokens.push(ch); i++; continue; }
    // number (including decimals)
    if (/[\d.]/.test(ch)) {
      let num = "";
      while (i < input.length && /[\d.]/.test(input[i]!)) num += input[i++];
      tokens.push(num);
      continue;
    }
    // identifier or agg function name
    let id = "";
    while (i < input.length && /[^\s+\-*/(),]/.test(input[i]!)) id += input[i++];
    tokens.push(id);
  }
  return tokens;
};

const AGG_NAMES = new Set<string>(["count", "sum", "avg", "min", "max", "median"]);

/** Recursive descent parser: expr → term ((+|-) term)* */
const parseCalcExpr = (tokens: string[]): CalcNode => {
  let pos = 0;

  const peek = () => tokens[pos];
  const consume = () => tokens[pos++]!;

  const parseAtom = (): CalcNode => {
    const token = peek();
    if (!token) throw new Error("Unexpected end of calc expression");

    // parenthesized sub-expression
    if (token === "(") {
      consume(); // (
      const node = parseAddSub();
      if (peek() !== ")") throw new Error("Missing closing parenthesis in calc()");
      consume(); // )
      return node;
    }

    // unary minus
    if (token === "-") {
      consume();
      const operand = parseAtom();
      return { kind: "binOp", op: "*", left: { kind: "literal", value: -1 }, right: operand };
    }

    // number literal
    if (/^\d/.test(token) || (token.startsWith(".") && token.length > 1)) {
      consume();
      return { kind: "literal", value: Number(token) };
    }

    // aggregation: sum(col), count(), etc.
    if (AGG_NAMES.has(token.toLowerCase()) && tokens[pos + 1] === "(") {
      const fn = consume().toLowerCase() as AggFn;
      consume(); // (
      let col: string | undefined;
      if (peek() !== ")") col = consume();
      if (peek() !== ")") throw new Error(`Missing closing parenthesis for ${fn}()`);
      consume(); // )
      return { kind: "aggRef", fn, column: col || undefined };
    }

    // column reference
    consume();
    return { kind: "colRef", name: token };
  };

  const parseMulDiv = (): CalcNode => {
    let left = parseAtom();
    while (peek() === "*" || peek() === "/") {
      const op = consume() as "*" | "/";
      left = { kind: "binOp", op, left, right: parseAtom() };
    }
    return left;
  };

  const parseAddSub = (): CalcNode => {
    let left = parseMulDiv();
    while (peek() === "+" || peek() === "-") {
      const op = consume() as "+" | "-";
      left = { kind: "binOp", op, left, right: parseMulDiv() };
    }
    return left;
  };

  const result = parseAddSub();
  if (pos < tokens.length) throw new Error(`Unexpected token in calc(): "${tokens[pos]}"`);
  return result;
};

/** Evaluate a calc expression tree against a row or aggregation context. */
const evalCalcNode = (
  node: CalcNode,
  resolveCol: (name: string) => number,
  resolveAgg: (fn: AggFn, column?: string) => number,
): number => {
  switch (node.kind) {
    case "literal": return node.value;
    case "colRef": return resolveCol(node.name);
    case "aggRef": return resolveAgg(node.fn, node.column);
    case "binOp": {
      const l = evalCalcNode(node.left, resolveCol, resolveAgg);
      const r = evalCalcNode(node.right, resolveCol, resolveAgg);
      switch (node.op) {
        case "+": return l + r;
        case "-": return l - r;
        case "*": return l * r;
        case "/": return r === 0 ? NaN : l / r;
      }
    }
  }
};

/** Collect all column references from a calc tree (for validation). */
const collectColRefs = (node: CalcNode): string[] => {
  if (node.kind === "colRef") return [node.name];
  if (node.kind === "aggRef") return node.column ? [node.column] : [];
  if (node.kind === "binOp") return [...collectColRefs(node.left), ...collectColRefs(node.right)];
  return [];
};

const hasAggRefs = (node: CalcNode): boolean => {
  if (node.kind === "aggRef") return true;
  if (node.kind === "binOp") return hasAggRefs(node.left) || hasAggRefs(node.right);
  return false;
};

// ---------------------------------------------------------------------------
// Select expression types
// ---------------------------------------------------------------------------

export type SelectExpr =
  | { kind: "column"; column: string; alias?: string }
  | { kind: "agg"; fn: AggFn; column?: string; alias?: string }
  | { kind: "calc"; tree: CalcNode; raw: string; alias?: string };

export type QueryResult = TableWriteResult & {
  matchedRows: number;
  totalRows: number;
  columns: string[];
};

const CALC_RE = /^calc\((.+)\)(?:\s+as\s+(.+))?$/i;
const AGG_RE = /^(count|sum|avg|min|max|median)\(([^)]*)\)(?:\s+as\s+(.+))?$/i;
const COL_RE = /^(.+?)(?:\s+as\s+(.+))?$/;

export const parseSelectExpr = (expr: string): SelectExpr => {
  const trimmed = expr.trim();

  // calc(...) as Alias
  const calcMatch = trimmed.match(CALC_RE);
  if (calcMatch) {
    const inner = calcMatch[1]!.trim();
    const alias = calcMatch[2]?.trim();
    const tree = parseCalcExpr(tokenize(inner));
    return { kind: "calc", tree, raw: inner, alias };
  }

  const aggMatch = trimmed.match(AGG_RE);
  if (aggMatch) {
    const fn = aggMatch[1]!.toLowerCase() as AggFn;
    const col = aggMatch[2]?.trim() || undefined;
    const alias = aggMatch[3]?.trim();
    return { kind: "agg", fn, column: col, alias };
  }
  const colMatch = trimmed.match(COL_RE);
  if (colMatch) {
    const column = colMatch[1]!.trim();
    const alias = colMatch[2]?.trim();
    return { kind: "column", column, alias };
  }
  return { kind: "column", column: trimmed };
};

/** Parse a comma-separated select list, respecting parentheses. */
export const parseSelectList = (raw: string): SelectExpr[] => {
  const exprs: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of raw) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      exprs.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) exprs.push(current);
  return exprs.map(parseSelectExpr);
};

const outputName = (expr: SelectExpr): string => {
  if (expr.alias) return expr.alias;
  if (expr.kind === "column") return expr.column;
  if (expr.kind === "calc") return expr.raw.replace(/[^a-zA-Z0-9_]/g, "_");
  return expr.column ? `${expr.fn}_${expr.column}` : expr.fn;
};

const computeAgg = (fn: AggFn, values: string[]): number => {
  if (fn === "count") return values.length;
  const nums = values.filter((v) => v !== "").map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) return 0;
  switch (fn) {
    case "sum": return nums.reduce((a, b) => a + b, 0);
    case "avg": return nums.reduce((a, b) => a + b, 0) / nums.length;
    case "min": return nums.reduce((a, b) => a < b ? a : b);
    case "max": return nums.reduce((a, b) => a > b ? a : b);
    case "median": {
      const sorted = [...nums].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    }
  }
};

const formatCalcResult = (n: number): string =>
  isNaN(n) || !isFinite(n) ? "" : Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, "");

export const tableQuery = async (
  bytes: Uint8Array,
  filename: string,
  options: {
    select?: SelectExpr[];
    where?: FilterCondition[];
    groupBy?: string;
    sort?: { column: string; desc: boolean };
    limit?: number;
    sheet?: string;
  } = {},
): Promise<QueryResult> => {
  const workbook = await parseWorkbook(bytes, filename);
  const sheet = selectSheet(workbook, options.sheet);
  const totalRows = sheet.rows.length;

  if (options.where) {
    for (const cond of options.where) {
      if (!sheet.columns.includes(cond.column)) throw new Error(`Unknown column in --where: ${cond.column}`);
      if (cond.op === "matches") regexCache(cond.value);
    }
  }

  const selects = options.select ?? sheet.columns.map((c) => ({ kind: "column" as const, column: c }));

  // Validate column references
  for (const expr of selects) {
    if (expr.kind === "column" && !sheet.columns.includes(expr.column)) {
      throw new Error(`Unknown column in --select: ${expr.column}`);
    }
    if (expr.kind === "agg" && expr.column && !sheet.columns.includes(expr.column)) {
      throw new Error(`Unknown column in --select: ${expr.column}`);
    }
    if (expr.kind === "calc") {
      for (const ref of collectColRefs(expr.tree)) {
        if (!sheet.columns.includes(ref)) throw new Error(`Unknown column in calc(): ${ref}`);
      }
    }
  }

  if (options.groupBy && !sheet.columns.includes(options.groupBy)) {
    throw new Error(`Unknown column in --group: ${options.groupBy}`);
  }

  let rows = options.where
    ? sheet.rows.filter((row) => options.where!.every((c) => matchRow(row, c)))
    : sheet.rows;
  const matchedRows = rows.length;

  const needsGrouping = selects.some((s) => s.kind === "agg" || (s.kind === "calc" && hasAggRefs(s.tree)));
  const outColumns = selects.map(outputName);
  let resultRows: Array<Record<string, string>>;

  if (needsGrouping) {
    const groups = new Map<string, Array<Record<string, string>>>();
    if (options.groupBy) {
      for (const row of rows) {
        const key = row[options.groupBy] ?? "";
        const list = groups.get(key) ?? [];
        list.push(row);
        groups.set(key, list);
      }
    } else {
      groups.set("__all__", rows);
    }

    resultRows = [];
    for (const [, groupRows] of groups) {
      const resultRow: Record<string, string> = {};
      const resolveCol = (name: string) => {
        const v = groupRows[0]?.[name] ?? "";
        return v !== "" ? Number(v) || 0 : 0;
      };
      const resolveAgg = (fn: AggFn, column?: string) => {
        const values = column
          ? groupRows.map((r) => r[column] ?? "")
          : groupRows.map(() => "1");
        return computeAgg(fn, values);
      };

      for (const expr of selects) {
        const name = outputName(expr);
        if (expr.kind === "column") {
          resultRow[name] = groupRows[0]?.[expr.column] ?? "";
        } else if (expr.kind === "agg") {
          resultRow[name] = formatCalcResult(resolveAgg(expr.fn, expr.column));
        } else if (expr.kind === "calc") {
          resultRow[name] = formatCalcResult(evalCalcNode(expr.tree, resolveCol, resolveAgg));
        }
      }
      resultRows.push(resultRow);
    }
  } else {
    // Row-level: projection + calc on each row
    resultRows = rows.map((row) => {
      const out: Record<string, string> = {};
      const resolveCol = (name: string) => {
        const v = row[name] ?? "";
        return v !== "" ? Number(v) || 0 : 0;
      };
      const resolveAgg = (): number => { throw new Error("Aggregation functions require --group"); };

      for (const expr of selects) {
        const name = outputName(expr);
        if (expr.kind === "column") {
          out[name] = row[expr.column] ?? "";
        } else if (expr.kind === "calc") {
          out[name] = formatCalcResult(evalCalcNode(expr.tree, resolveCol, resolveAgg));
        }
      }
      return out;
    });
  }

  if (options.sort) {
    const col = options.sort.column;
    if (!outColumns.includes(col)) throw new Error(`Unknown column in --sort: ${col}`);
    const desc = options.sort.desc;
    resultRows.sort((a, b) => {
      const va = a[col] ?? "";
      const vb = b[col] ?? "";
      const na = va !== "" ? Number(va) : NaN;
      const nb = vb !== "" ? Number(vb) : NaN;
      const cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : va.localeCompare(vb);
      return desc ? -cmp : cmp;
    });
  }

  if (options.limit && options.limit > 0) resultRows = resultRows.slice(0, options.limit);

  return {
    ...csvResult(toCsv(outColumns, resultRows)),
    matchedRows,
    totalRows,
    columns: outColumns,
  };
};

// ---------------------------------------------------------------------------
// CSV → Chart helper
// ---------------------------------------------------------------------------

export const parseCsvForChart = (
  bytes: Uint8Array,
  filename: string,
  xColumn: string,
  yColumns: string[],
): { labels: string[]; series: Record<string, number[]> } => {
  const workbook = parseCsvWorkbook(bytes, filename);
  const sheet = workbook.sheets[0];
  if (!sheet) throw new Error("Empty CSV file.");

  if (!sheet.columns.includes(xColumn)) {
    throw new Error(`Column "${xColumn}" not found. Available: ${sheet.columns.join(", ")}`);
  }
  for (const y of yColumns) {
    if (!sheet.columns.includes(y)) {
      throw new Error(`Column "${y}" not found. Available: ${sheet.columns.join(", ")}`);
    }
  }

  const labels = sheet.rows.map((r) => r[xColumn] ?? "");
  const series: Record<string, number[]> = {};
  // Include x column in series too (needed for scatter where x is numeric)
  const allCols = [xColumn, ...yColumns.filter((y) => y !== xColumn)];
  for (const col of allCols) {
    series[col] = sheet.rows.map((r) => {
      const v = r[col] ?? "";
      if (v === "") return 0;
      const n = Number(v);
      return isNaN(n) ? 0 : n;
    });
  }
  return { labels, series };
};

// ---------------------------------------------------------------------------
// Filter API
// ---------------------------------------------------------------------------

export type FilterOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "starts_with" | "matches" | "is_empty" | "is_not_empty";

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
  const trimmed = expr.trim();

  // "column is empty" / "column is not empty"
  const emptyMatch = trimmed.match(/^(.+?)\s+is\s+not\s+empty$/i);
  if (emptyMatch) return { column: emptyMatch[1]!.trim(), op: "is_not_empty", value: "" };
  const emptyMatch2 = trimmed.match(/^(.+?)\s+is\s+empty$/i);
  if (emptyMatch2) return { column: emptyMatch2[1]!.trim(), op: "is_empty", value: "" };

  for (const { token, op } of OPS) {
    const idx = trimmed.indexOf(token);
    if (idx > 0) {
      return {
        column: trimmed.slice(0, idx).trim(),
        op,
        value: trimmed.slice(idx + token.length).trim(),
      };
    }
  }
  throw new Error(`Invalid filter: "${expr}". Use: column = value, column > 100, column is empty, column is not empty, column contains text`);
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

  if (cond.op === "is_empty") return cell === "";
  if (cond.op === "is_not_empty") return cell !== "";
  if (cond.op === "contains") return cell.toLowerCase().includes(val.toLowerCase());
  if (cond.op === "starts_with") return cell.toLowerCase().startsWith(val.toLowerCase());
  if (cond.op === "matches") return regexCache(val).test(cell);
  if (cond.op === "=") return val === "" ? cell === "" : cell.toLowerCase() === val.toLowerCase();
  if (cond.op === "!=") return val === "" ? cell !== "" : cell.toLowerCase() !== val.toLowerCase();

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
