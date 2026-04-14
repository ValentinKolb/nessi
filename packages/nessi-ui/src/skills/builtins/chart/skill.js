export default function create(api) {
  const { cli, ok, err, parseArgs, helpers } = api;

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

  return cli({ name: "chart", description: "Generate bar, line, or pie charts" })
    .sub({
      name: "bar",
      usage: 'bar --labels "A,B,C" --values "10,20,15" [--title "Title"] [--output /output/chart.svg]',
      async handler(args, _helpers, ctx) {
        const opts = parseArgs(args);
        const labelsRaw = opts.get("labels");
        const valuesRaw = opts.get("values");
        if (!labelsRaw || !valuesRaw) return err("Both --labels and --values are required.");

        const labels = parseLabels(labelsRaw);
        const values = parseValues(valuesRaw);
        if (labels.length === 0 || values.length === 0) return err("Labels and values must not be empty.");

        const title = opts.get("title");
        const outputPath = opts.get("output") ?? "/output/bar-chart.svg";

        try {
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
      usage: 'line --labels "Q1,Q2,Q3" --series \'{"A":[1,2,3]}\' [--title "Title"] [--output /output/chart.svg]',
      async handler(args, _helpers, ctx) {
        const opts = parseArgs(args);
        const labelsRaw = opts.get("labels");
        const seriesRaw = opts.get("series");
        if (!labelsRaw || !seriesRaw) return err("Both --labels and --series are required.");

        const labels = parseLabels(labelsRaw);
        if (labels.length === 0) return err("Labels must not be empty.");

        let series;
        try {
          series = JSON.parse(seriesRaw);
          if (!series || typeof series !== "object" || Array.isArray(series)) throw new Error();
        } catch {
          return err('--series must be a JSON object, e.g. \'{"Revenue":[100,200,150]}\'');
        }

        const title = opts.get("title");
        const outputPath = opts.get("output") ?? "/output/line-chart.svg";

        try {
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
      usage: 'pie --labels "A,B,C" --values "40,30,30" [--title "Title"] [--output /output/chart.svg]',
      async handler(args, _helpers, ctx) {
        const opts = parseArgs(args);
        const labelsRaw = opts.get("labels");
        const valuesRaw = opts.get("values");
        if (!labelsRaw || !valuesRaw) return err("Both --labels and --values are required.");

        const labels = parseLabels(labelsRaw);
        const values = parseValues(valuesRaw);
        if (labels.length === 0 || values.length === 0) return err("Labels and values must not be empty.");

        const title = opts.get("title");
        const outputPath = opts.get("output") ?? "/output/pie-chart.svg";

        try {
          const svg = helpers.chart.pie({ labels, values, title });
          await writeSvg(ctx, outputPath, svg);
          return ok(`Chart saved to ${outputPath}\nUse the present tool to display it inline.\n`);
        } catch (e) {
          return err(e instanceof Error ? e.message : "Failed to generate pie chart.");
        }
      },
    });
}
