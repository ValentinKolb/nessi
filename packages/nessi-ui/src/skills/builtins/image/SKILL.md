---
name: image
description: "Resize, compress, crop, rotate, convert, and filter images locally. Use for any image manipulation task."
metadata:
  nessi:
    command: image
    enabled: true
---

# Image

Client-side image processing. All operations run in the browser — nothing is uploaded to any server.

## Commands

### Resize

```bash
image resize /input/photo.jpg --width 800 --output /output/resized.jpg
image resize /input/photo.png --height 600 --output /output/small.png
image resize /input/photo.jpg --width 1200 --height 800 --fit contain --output /output/fitted.jpg
```

Fit modes: `fill` (stretch, default), `cover` (crop to fill), `contain` (letterbox).

### Compress

```bash
image compress /input/photo.jpg --quality 0.7 --output /output/compressed.jpg
image compress /input/photo.png --format webp --quality 0.8 --output /output/photo.webp
```

### Crop

```bash
image crop /input/photo.jpg --x 100 --y 50 --width 400 --height 300 --output /output/cropped.jpg
```

### Rotate

```bash
image rotate /input/photo.jpg --degrees 90 --output /output/rotated.jpg
```

Supports: 90, 180, 270 degrees.

### Convert format

```bash
image convert /input/photo.png --format webp --output /output/photo.webp
image convert /input/photo.jpg --format png --output /output/photo.png
```

Formats: `jpeg`, `png`, `webp`.

### Filter

```bash
image filter /input/photo.jpg --effect grayscale --output /output/bw.jpg
image filter /input/photo.jpg --effect vintage --output /output/vintage.jpg
```

Effects: `grayscale`, `vintage`, `dramatic`, `soft`, `blur`.

## Notes

- Input files from `/input/` or `/output/`
- Output always to `/output/`
- All processing is local — no data leaves the browser
- Use `present` to display the result inline after processing
