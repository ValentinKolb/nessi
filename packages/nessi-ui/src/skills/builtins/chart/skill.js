export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;

  const parseLabels = (raw) =>
    raw.split(",").map((s) => s.trim()).filter(Boolean);

  const parseValues = (raw) =>
    raw.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));

  const writeSvg = async (ctx, outputPath, svg) => {
    if (!outputPath.startsWith("/output/")) throw new Error("Output path must be under /output.");
    const dir = outputPath.slice(0, outputPath.lastIndexOf("/")) || "/";
    if (dir !== "/") await ctx.fs.mkdir(dir, { recursive: true });
    await ctx.fs.writeFile(outputPath, svg, "utf8");
  };

  /** Read a CSV file and extract x/y columns for charting. */
  const readCsvData = async (ctx, filePath, xCol, yCols) => {
    let bytes;
    try {
      bytes = await helpers.files.readBytes(filePath);
    } catch {
      try {
        bytes = await ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, filePath));
      } catch {
        throw new Error(`Could not read file: ${filePath}`);
      }
    }
    if (!xCol) throw new Error("--x is required when reading from a CSV file.");
    if (!yCols) throw new Error("--y is required when reading from a CSV file.");
    const yList = yCols.split(",").map((s) => s.trim()).filter(Boolean);
    if (yList.length === 0) throw new Error("--y must specify at least one column.");
    return helpers.table.csvForChart(bytes, filePath, xCol, yList);
  };

  return cli({ name: "chart", description: "Generate bar, line, or pie charts from data or CSV files" })
    .sub({
      name: "bar",
      usage: 'bar [file.csv --x "col" --y "col"] | [--labels "A,B" --values "10,20"] [--title "T"] [--output /output/chart.svg]',
      async handler(args, _helpers, ctx) {
        const opts = parseArgs(args);
        const filePath = positionalArgs(args)[0];
        const title = opts.get("title");
        const outputPath = opts.get("output") ?? "/output/bar-chart.svg";

        let labels, values;
        try {
          if (filePath) {
            const data = await readCsvData(ctx, filePath, opts.get("x"), opts.get("y"));
            const yCol = opts.get("y")?.split(",")[0]?.trim();
            labels = data.labels;
            values = data.series[yCol];
            if (!values) return err(`Column "${yCol}" not found in CSV.`);
          } else {
            const labelsRaw = opts.get("labels");
            const valuesRaw = opts.get("values");
            if (!labelsRaw || !valuesRaw) return err("Provide a CSV file with --x/--y, or use --labels and --values.");
            labels = parseLabels(labelsRaw);
            values = parseValues(valuesRaw);
          }

          if (labels.length === 0 || values.length === 0) return err("Labels and values must not be empty.");
          const svg = helpers.chart.bar({ labels, values, title });
          await writeSvg(ctx, outputPath, svg);
          return ok(`Chart saved to ${outputPath}\nUse the present tool to display it inline.\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to generate bar chart.");
        }
      },
    })
    .sub({
      name: "line",
      usage: 'line [file.csv --x "col" --y "col1,col2"] | [--labels "Q1,Q2" --series \'{"A":[1,2]}\'] [--title "T"] [--output /output/chart.svg]',
      async handler(args, _helpers, ctx) {
        const opts = parseArgs(args);
        const filePath = positionalArgs(args)[0];
        const title = opts.get("title");
        const outputPath = opts.get("output") ?? "/output/line-chart.svg";

        let labels, series;
        try {
          if (filePath) {
            const data = await readCsvData(ctx, filePath, opts.get("x"), opts.get("y"));
            labels = data.labels;
            series = data.series;
          } else {
            const labelsRaw = opts.get("labels");
            const seriesRaw = opts.get("series");
            if (!labelsRaw || !seriesRaw) return err("Provide a CSV file with --x/--y, or use --labels and --series.");
            labels = parseLabels(labelsRaw);
            try {
              series = JSON.parse(seriesRaw);
              if (!series || typeof series !== "object" || Array.isArray(series)) throw new Error();
            } catch {
              return err('--series must be a JSON object, e.g. \'{"Revenue":[100,200,150]}\'');
            }
          }

          if (labels.length === 0) return err("Labels must not be empty.");
          const svg = helpers.chart.line({ labels, series, title });
          await writeSvg(ctx, outputPath, svg);
          return ok(`Chart saved to ${outputPath}\nUse the present tool to display it inline.\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to generate line chart.");
        }
      },
    })
    .sub({
      name: "pie",
      usage: 'pie [file.csv --x "col" --y "col"] | [--labels "A,B" --values "40,60"] [--title "T"] [--output /output/chart.svg]',
      async handler(args, _helpers, ctx) {
        const opts = parseArgs(args);
        const filePath = positionalArgs(args)[0];
        const title = opts.get("title");
        const outputPath = opts.get("output") ?? "/output/pie-chart.svg";

        let labels, values;
        try {
          if (filePath) {
            const data = await readCsvData(ctx, filePath, opts.get("x"), opts.get("y"));
            const yCol = opts.get("y")?.split(",")[0]?.trim();
            labels = data.labels;
            values = data.series[yCol];
            if (!values) return err(`Column "${yCol}" not found in CSV.`);
          } else {
            const labelsRaw = opts.get("labels");
            const valuesRaw = opts.get("values");
            if (!labelsRaw || !valuesRaw) return err("Provide a CSV file with --x/--y, or use --labels and --values.");
            labels = parseLabels(labelsRaw);
            values = parseValues(valuesRaw);
          }

          if (labels.length === 0 || values.length === 0) return err("Labels and values must not be empty.");
          const svg = helpers.chart.pie({ labels, values, title });
          await writeSvg(ctx, outputPath, svg);
          return ok(`Chart saved to ${outputPath}\nUse the present tool to display it inline.\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to generate pie chart.");
        }
      },
    });
}
