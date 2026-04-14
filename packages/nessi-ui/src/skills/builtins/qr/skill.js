export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;

  return cli({ name: "qr", description: "Generate QR codes from text or URLs" })
    .sub({
      name: "generate",
      usage: 'generate <text> [--scale 8] [--output /output/qr.svg]',
      async handler(args, _helpers, ctx) {
        const data = positionalArgs(args)[0];
        if (!data) return err("Usage: qr generate <text>");
        const opts = parseArgs(args);
        const scale = parseInt(opts.get("scale") ?? "8", 10) || 8;
        const outputPath = opts.get("output") ?? "/output/qr-code.svg";

        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");

        try {
          const svg = helpers.qr.svg(data, { scale });
          const dir = outputPath.slice(0, outputPath.lastIndexOf("/")) || "/";
          if (dir !== "/") await ctx.fs.mkdir(dir, { recursive: true });
          await ctx.fs.writeFile(outputPath, svg, "utf8");
          return ok(`QR code saved to ${outputPath}\nUse the present tool to display it inline.\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to generate QR code.");
        }
      },
    });
}
