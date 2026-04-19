export default function create(api) {
  const { defineCommand, ok, err, parseArgs, positionalArgs, helpers } = api;

  const readImage = async (ctx, path) => {
    try {
      return await helpers.files.readBytes(path);
    } catch {
      return ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, path));
    }
  };

  const writeOutput = async (ctx, path, bytes) => {
    if (!path.startsWith("/output/")) throw new Error("Output path must be under /output/.");
    const dir = path.slice(0, path.lastIndexOf("/")) || "/";
    if (dir !== "/") await ctx.fs.mkdir(dir, { recursive: true });
    await ctx.fs.writeFile(path, bytes);
  };

  const guessFormat = (path) => {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "png") return "png";
    if (ext === "webp") return "webp";
    return "jpeg";
  };

  const defaultOutput = (inputPath, suffix, format) => {
    const base = inputPath.split("/").pop() ?? "image";
    const stem = base.replace(/\.[^.]+$/, "");
    const ext = format === "png" ? "png" : format === "webp" ? "webp" : "jpg";
    return `/output/${stem}${suffix}.${ext}`;
  };

  // Lazy-load stdlib images module (browser-only, avoid SSR issues)
  let imagesModule = null;
  const getImages = async () => {
    if (imagesModule) return imagesModule;
    const mod = await import("@valentinkolb/stdlib/browser");
    imagesModule = mod.images;
    return imagesModule;
  };

  const processImage = async (ctx, inputPath, transforms, format, quality, outputPath) => {
    const images = await getImages();
    const bytes = await readImage(ctx, inputPath);
    const blob = new Blob([bytes]);

    let pipeline = images.create(blob);
    for (const t of transforms) {
      pipeline = pipeline.then(t);
    }

    const fmt = format || guessFormat(outputPath || inputPath);
    const q = quality ?? (fmt === "png" ? undefined : 0.88);
    const resultBlob = await pipeline.then(images.toBlob(fmt, q));

    const resultBytes = new Uint8Array(await resultBlob.arrayBuffer());
    await writeOutput(ctx, outputPath, resultBytes);

    return { size: resultBytes.byteLength, format: fmt };
  };

  const fmtSize = (b) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`;

  return defineCommand("image", async (args, ctx) => {
    const sub = (args[0] || "").toLowerCase();
    const rest = args.slice(1);
    const inputPath = positionalArgs(rest)[0];
    const opts = parseArgs(rest);

    if (sub === "--help" || sub === "-h" || !sub) {
      return ok([
        "image - Client-side image processing",
        "",
        "  image resize <file> --width N [--height N] [--fit fill|cover|contain] [--output ...]",
        "  image compress <file> [--quality 0.7] [--format webp] [--output ...]",
        "  image crop <file> --x N --y N --width N --height N [--output ...]",
        "  image rotate <file> --degrees 90|180|270 [--output ...]",
        "  image convert <file> --format png|jpeg|webp [--output ...]",
        "  image filter <file> --effect grayscale|vintage|dramatic|soft|blur [--output ...]",
        "",
      ].join("\n"));
    }

    if (!inputPath) return err(`Usage: image ${sub} <file> [options]`);

    try {
      const images = await getImages();
      const format = opts.get("format") || null;
      const quality = opts.get("quality") ? parseFloat(opts.get("quality")) : undefined;

      if (sub === "resize") {
        const w = opts.get("width") ? parseInt(opts.get("width"), 10) : undefined;
        const h = opts.get("height") ? parseInt(opts.get("height"), 10) : undefined;
        if (!w && !h) return err("At least --width or --height is required.");
        const fit = opts.get("fit") || "fill";
        const out = opts.get("output") || defaultOutput(inputPath, "-resized", format || guessFormat(inputPath));
        const r = await processImage(ctx, inputPath, [images.resize(w, h, fit)], format, quality, out);
        return ok(`Resized to ${out} (${fmtSize(r.size)}, ${r.format})\n`);
      }

      if (sub === "compress") {
        const out = opts.get("output") || defaultOutput(inputPath, "-compressed", format || "webp");
        const r = await processImage(ctx, inputPath, [], format || "webp", quality ?? 0.7, out);
        return ok(`Compressed to ${out} (${fmtSize(r.size)}, ${r.format})\n`);
      }

      if (sub === "crop") {
        const x = parseInt(opts.get("x") || "0", 10);
        const y = parseInt(opts.get("y") || "0", 10);
        const w = parseInt(opts.get("width") || "0", 10);
        const h = parseInt(opts.get("height") || "0", 10);
        if (!w || !h) return err("--width and --height are required for crop.");
        const out = opts.get("output") || defaultOutput(inputPath, "-cropped", format || guessFormat(inputPath));
        const r = await processImage(ctx, inputPath, [images.crop(x, y, w, h)], format, quality, out);
        return ok(`Cropped to ${out} (${fmtSize(r.size)})\n`);
      }

      if (sub === "rotate") {
        const deg = parseInt(opts.get("degrees") || "90", 10);
        if (![90, 180, 270].includes(deg)) return err("--degrees must be 90, 180, or 270.");
        const out = opts.get("output") || defaultOutput(inputPath, "-rotated", format || guessFormat(inputPath));
        const r = await processImage(ctx, inputPath, [images.rotate(deg)], format, quality, out);
        return ok(`Rotated ${deg}° to ${out} (${fmtSize(r.size)})\n`);
      }

      if (sub === "convert") {
        if (!format) return err("--format is required. Use: jpeg, png, webp.");
        const out = opts.get("output") || defaultOutput(inputPath, "", format);
        const r = await processImage(ctx, inputPath, [], format, quality, out);
        return ok(`Converted to ${out} (${fmtSize(r.size)}, ${r.format})\n`);
      }

      if (sub === "filter") {
        const effect = opts.get("effect") || "grayscale";
        const filterMap = {
          grayscale: images.filters.grayscale,
          vintage: images.filters.vintage,
          dramatic: images.filters.dramatic,
          soft: images.filters.soft,
          blur: images.filter("blur(3px)"),
        };
        const filterFn = filterMap[effect];
        if (!filterFn) return err(`Unknown effect: "${effect}". Use: grayscale, vintage, dramatic, soft, blur.`);
        const out = opts.get("output") || defaultOutput(inputPath, `-${effect}`, format || guessFormat(inputPath));
        const r = await processImage(ctx, inputPath, [typeof filterFn === "function" && filterFn.length === 0 ? filterFn : filterFn], format, quality, out);
        return ok(`Applied ${effect} to ${out} (${fmtSize(r.size)})\n`);
      }

      return err(`Unknown subcommand: ${sub}. Use 'image --help'.`);
    } catch (e) {
      return err(e instanceof Error ? e.message : "Image processing failed.");
    }
  });
}
