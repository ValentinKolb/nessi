---
name: qr
description: Generate QR codes from text or URLs. Use this whenever the user mentions QR codes, wants to share a link as a scannable image, or needs a printable code. Renders inline with download.
metadata:
  nessi:
    command: qr
    enabled: true
---

# QR

Use the `qr` command to generate QR codes.

Prefer this when the user wants to:
- create a QR code from a URL or text
- share a link as scannable image
- save a QR code as SVG file

## Commands

### Generate

```bash
qr generate "https://example.com"
qr generate "Hello World" --output /output/hello.svg
qr generate "https://example.com" --scale 12
```

## Notes

- QR codes are rendered inline in the chat with a download button.
- Output format is always SVG.
- Use `--scale` to control pixel size (default: 8).
- Use `--output` to also save the SVG to a file.
