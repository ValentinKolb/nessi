---
name: pdf
description: Extract text from PDFs and create new PDF files by splitting or merging. Use this whenever the user wants to read, split, or combine PDF documents.
metadata:
  nessi:
    command: pdf
    enabled: true
---

# PDF

Use the `pdf` command for PDF-specific work.

Prefer this before ad-hoc shell work when the user wants to:
- extract readable text from a PDF
- split a PDF into a smaller document
- merge multiple PDFs into one

## Commands

### Extract text

```bash
pdf text /input/file.pdf --output /output/file.txt
pdf text /input/file.pdf --format md --output /output/file.md
```

### Split

```bash
pdf split /input/file.pdf --pages "1-3" --output /output/part-a.pdf
pdf split /input/file.pdf --pages "4-7" --output /output/part-b.pdf
```

### Merge

```bash
pdf merge /input/a.pdf /input/b.pdf --output /output/merged.pdf
```

## Notes

- Text extraction supports embedded text only in this version.
- OCR is not supported yet.
- `--pages` accepts simple ranges like `1-3`, `5`, or `1-2,4,7-9`.
- Output files should be written under `/output`.
