// @ts-nocheck
export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;
  const encoder = new TextEncoder();

  function parseColumns(value) {
    return typeof value === "string"
      ? value.split(",").map((entry) => entry.trim()).filter(Boolean)
      : undefined;
  }

  function parseRows(value, fallback) {
    const parsed = parseInt(value ?? String(fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function defaultOutput(path, extension, suffix = "") {
    const base = path.split("/").pop() ?? "table";
    const stem = base.replace(/\.[^.]+$/, "");
    return `/output/${stem}${suffix}.${extension}`;
  }

  function markdownPreview(columns, rows) {
    if (!columns.length) return "No columns found.";
    const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const header = `| ${columns.map(escape).join(" | ")} |`;
    const divider = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(" | ")} |`);
    return [header, divider, ...body].join("\n");
  }

  async function readBytes(ctx, path) {
    try {
      return await helpers.files.readBytes(path);
    } catch {
      try {
        return await ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, path));
      } catch {
        throw new Error(`Could not read file: ${path}`);
      }
    }
  }

  return cli({ name: "table", description: "Inspect and preview CSV/XLSX files" })
    .sub({
      name: "info",
      usage: "info <file>",
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: table info <file>");
        try {
          const bytes = await readBytes(ctx, path);
          const info = await helpers.table.info(bytes, path);
          const lines = [`Format: ${info.format.toUpperCase()}`, `Sheets: ${info.sheets.length}`, ""];
          for (const sheet of info.sheets) {
            lines.push(`- ${sheet.name}: ${sheet.rowCount} rows, ${sheet.columnCount} columns`);
          }
          return ok(lines.join("\n").trim() + "\n");
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to inspect table.");
        }
      },
    })
    .sub({
      name: "sheets",
      usage: "sheets <file>",
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: table sheets <file>");
        try {
          const bytes = await readBytes(ctx, path);
          const info = await helpers.table.info(bytes, path);
          return ok(info.sheets.map((sheet) => sheet.name).join("\n") + "\n");
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to list sheets.");
        }
      },
    })
    .sub({
      name: "columns",
      usage: "columns <file> [--sheet \"Sheet1\"]",
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: table columns <file> [--sheet \"Sheet1\"]");
        const opts = parseArgs(args);
        try {
          const bytes = await readBytes(ctx, path);
          const result = await helpers.table.columns(bytes, path, opts.get("sheet"));
          const lines = [`Sheet: ${result.sheet}`, "", ...result.columns.map((column) => `- ${column}`)];
          return ok(lines.join("\n") + "\n");
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to read columns.");
        }
      },
    })
    .sub({
      name: "peek",
      usage: "peek <file> [--sheet \"Sheet1\"] [--rows 20] [--columns \"a,b\"]",
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: table peek <file> [--sheet \"Sheet1\"] [--rows 20] [--columns \"a,b\"]");
        const opts = parseArgs(args);
        try {
          const bytes = await readBytes(ctx, path);
          const preview = await helpers.table.peek(bytes, path, {
            sheet: opts.get("sheet"),
            rows: parseRows(opts.get("rows"), 20),
            columns: parseColumns(opts.get("columns")),
          });
          const lines = [`Sheet: ${preview.sheet}`, `Rows shown: ${preview.rows.length}`, "", markdownPreview(preview.columns, preview.rows)];
          return ok(lines.join("\n").trim() + "\n");
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to preview table.");
        }
      },
    });
}
