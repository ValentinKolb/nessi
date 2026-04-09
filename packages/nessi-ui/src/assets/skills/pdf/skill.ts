// @ts-nocheck
export default function create(api) {
  const { cli, ok, err, parseArgs, positionalArgs, helpers } = api;

  function baseName(path) {
    return (path.split("/").pop() ?? "file").replace(/\.[^.]+$/, "");
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

  async function writeBytes(ctx, outputPath, bytes) {
    const resolved = ctx.fs.resolvePath(ctx.cwd, outputPath);
    const dir = resolved.slice(0, resolved.lastIndexOf("/")) || "/";
    if (dir !== "/") {
      await ctx.fs.mkdir(dir, { recursive: true });
    }
    await ctx.fs.writeFileBuffer(resolved, bytes);
  }

  async function writeText(ctx, outputPath, content) {
    const resolved = ctx.fs.resolvePath(ctx.cwd, outputPath);
    const dir = resolved.slice(0, resolved.lastIndexOf("/")) || "/";
    if (dir !== "/") {
      await ctx.fs.mkdir(dir, { recursive: true });
    }
    await ctx.fs.writeFile(resolved, content, "utf8");
  }

  return cli({ name: "pdf", description: "Extract text from PDFs and split or merge PDF files" })
    .sub({
      name: "text",
      usage: "text <file> [--format txt|md] [--output /output/file.txt]",
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        if (!path) return err("Usage: pdf text <file> [--format txt|md] [--output /output/file.txt]");
        const opts = parseArgs(args);
        const format = opts.get("format") === "md" ? "md" : "txt";
        const outputPath = opts.get("output") ?? `/output/${baseName(path)}.${format === "md" ? "md" : "txt"}`;
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");

        try {
          const bytes = await readBytes(ctx, path);
          const exported = await helpers.pdf.text(bytes, format);
          await writeText(ctx, outputPath, exported.content);
          return ok(`Wrote extracted PDF text to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to extract PDF text.");
        }
      },
    })
    .sub({
      name: "split",
      usage: "split <file> --pages \"1-3\" [--output /output/part.pdf]",
      async handler(args, _helpers, ctx) {
        const path = positionalArgs(args)[0];
        const opts = parseArgs(args);
        const pages = opts.get("pages");
        if (!path || !pages) return err("Usage: pdf split <file> --pages \"1-3\" [--output /output/part.pdf]");
        const outputPath = opts.get("output") ?? `/output/${baseName(path)}-split.pdf`;
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");

        try {
          const bytes = await readBytes(ctx, path);
          const nextBytes = await helpers.pdf.split(bytes, pages);
          await writeBytes(ctx, outputPath, nextBytes);
          return ok(`Wrote split PDF to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to split PDF.");
        }
      },
    })
    .sub({
      name: "merge",
      usage: "merge <file1> <file2> [<file3> ...] [--output /output/merged.pdf]",
      async handler(args, _helpers, ctx) {
        const files = positionalArgs(args).filter(Boolean);
        const opts = parseArgs(args);
        if (files.length < 2) return err("Usage: pdf merge <file1> <file2> [<file3> ...] [--output /output/merged.pdf]");
        const outputPath = opts.get("output") ?? "/output/merged.pdf";
        if (!outputPath.startsWith("/output/")) return err("Output path must be under /output.");

        try {
          const buffers = [];
          for (const file of files) {
            buffers.push(await readBytes(ctx, file));
          }
          const merged = await helpers.pdf.merge(buffers);
          await writeBytes(ctx, outputPath, merged);
          return ok(`Wrote merged PDF to ${outputPath}\n`);
        } catch (error) {
          return err(error instanceof Error ? error.message : "Failed to merge PDFs.");
        }
      },
    });
}
