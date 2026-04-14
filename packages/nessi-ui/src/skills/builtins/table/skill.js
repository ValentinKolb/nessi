export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;

  const parseColumns = (value) =>
    typeof value === "string"
      ? value.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

  const parseRows = (value, fallback) => {
    const parsed = parseInt(value ?? String(fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const defaultOutput = (path, extension, suffix = "") => {
    const base = path.split("/").pop() ?? "table";
    const stem = base.replace(/\.[^.]+$/, "");
    return `/output/${stem}${suffix}.${extension}`;
  };

  const markdownPreview = (columns, rows) => {
    if (!columns.length) return "No columns found.";
    const escape = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    const header = `| ${columns.map(escape).join(" | ")} |`;
    const divider = `| ${columns.map(() => "---").join(" | ")} |`;
    const body = rows.map((row) => `| ${columns.map((col) => escape(row[col])).join(" | ")} |`);
    return [header, divider, ...body].join("\n");
  };

  const readBytes = async (ctx, path) => {
    try {
      return await helpers.files.readBytes(path);
    } catch {
      try {
        return await ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, path));
      } catch {
        throw new Error(`Could not read file: ${path}`);
      }
    }
  };

  const writeText = async (ctx, path, content) => {
    const dir = path.slice(0, path.lastIndexOf("/")) || "/";
    if (dir !== "/") await ctx.fs.mkdir(dir, { recursive: true });
    await ctx.fs.writeFile(path, content, "utf8");
  };

  return cli({ name: "table", description: "Inspect, preview, and transform CSV/XLSX files" })
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
          return ok(info.sheets.map((s) => s.name).join("\n") + "\n");
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to list sheets.");
        }
      },
    })
    .sub({
      name: "columns",
      usage: 'columns <file> [--sheet "Sheet1"]',
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err('Usage: table columns <file> [--sheet "Sheet1"]');
        const opts = parseArgs(args);
        try {
          const bytes = await readBytes(ctx, path);
          const result = await helpers.table.columns(bytes, path, opts.get("sheet"));
          const lines = [`Sheet: ${result.sheet}`, "", ...result.columns.map((col) => `- ${col}`)];
          return ok(lines.join("\n") + "\n");
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to read columns.");
        }
      },
    })
    .sub({
      name: "peek",
      usage: 'peek <file> [--sheet "Sheet1"] [--rows 20] [--columns "a,b"]',
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err('Usage: table peek <file> [--sheet "Sheet1"] [--rows 20] [--columns "a,b"]');
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
    })
    .sub({
      name: "export",
      usage: 'export <file> [--sheet "Sheet1"] [--columns "a,b"] [--rows 100] [--output /output/data.csv]',
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: table export <file> [--output /output/data.csv]");
        const opts = parseArgs(args);
        const outputPath = opts.get("output") ?? defaultOutput(path, "csv");
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");
        try {
          const bytes = await readBytes(ctx, path);
          const result = await helpers.table.toCsv(bytes, path, {
            sheet: opts.get("sheet"),
            rows: parseRows(opts.get("rows"), undefined),
            columns: parseColumns(opts.get("columns")),
          });
          await writeText(ctx, outputPath, result.content);
          return ok(`Wrote CSV to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to export table.");
        }
      },
    })
    .sub({
      name: "append",
      usage: 'append <file> --json \'[{"col":"val"}]\' [--sheet "Sheet1"] [--output /output/data.csv]',
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: table append <file> --json '[{\"col\":\"val\"}]'");
        const opts = parseArgs(args);
        const jsonStr = opts.get("json");
        if (!jsonStr) return err("--json is required. Example: --json '[{\"name\":\"Alice\"}]'");
        const outputPath = opts.get("output") ?? defaultOutput(path, "csv", "-appended");
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");
        try {
          const newRows = JSON.parse(jsonStr);
          if (!Array.isArray(newRows)) return err("--json must be a JSON array of objects.");
          const bytes = await readBytes(ctx, path);
          const result = await helpers.table.appendRows(bytes, path, newRows, {
            sheet: opts.get("sheet"),
          });
          await writeText(ctx, outputPath, result.content);
          return ok(`Appended ${newRows.length} row(s), wrote CSV to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to append rows.");
        }
      },
    })
    .sub({
      name: "replace",
      usage: 'replace <file> --column "status" --old "pending" --new "done" [--sheet "Sheet1"] [--output /output/data.csv]',
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err('Usage: table replace <file> --column "col" --old "val" --new "val"');
        const opts = parseArgs(args);
        const column = opts.get("column");
        const oldValue = opts.get("old");
        const newValue = opts.get("new");
        if (!column || oldValue === undefined || newValue === undefined) {
          return err("--column, --old, and --new are all required.");
        }
        const outputPath = opts.get("output") ?? defaultOutput(path, "csv", "-replaced");
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");
        try {
          const bytes = await readBytes(ctx, path);
          const result = await helpers.table.replaceValues(bytes, path, column, oldValue, newValue, {
            sheet: opts.get("sheet"),
          });
          await writeText(ctx, outputPath, result.content);
          return ok(`Replaced values in column "${column}", wrote CSV to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to replace values.");
        }
      },
    })
    .sub({
      name: "filter",
      usage: 'filter <file> --where "column = value" [--where "amount > 100"] [--columns "a,b"] [--limit 50] [--sheet "Sheet1"] [--output /output/filtered.csv]',
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err('Usage: table filter <file> --where "column = value"');

        // collect all --where clauses (parseArgs only gets the last one, so parse manually)
        const wheres = [];
        for (let i = 0; i < args.length; i++) {
          if (args[i] === "--where" && args[i + 1]) {
            wheres.push(args[i + 1]);
            i++;
          }
        }
        if (wheres.length === 0) return err("At least one --where clause is required.");

        const opts = parseArgs(args);
        const outputPath = opts.get("output") ?? defaultOutput(path, "csv", "-filtered");
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");

        try {
          const conditions = wheres.map((w) => helpers.table.parseFilter(w));
          const limitStr = opts.get("limit");
          const limit = limitStr ? parseInt(limitStr, 10) : undefined;
          const bytes = await readBytes(ctx, path);
          const result = await helpers.table.filter(bytes, path, conditions, {
            sheet: opts.get("sheet"),
            columns: parseColumns(opts.get("columns")),
            limit,
          });
          await writeText(ctx, outputPath, result.content);
          return ok(`Matched ${result.matchedRows} of ${result.totalRows} rows${limit ? ` (limited to ${limit})` : ""}, wrote CSV to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to filter table.");
        }
      },
    });
}
