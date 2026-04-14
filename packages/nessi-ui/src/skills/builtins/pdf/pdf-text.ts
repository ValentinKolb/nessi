import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

let configured = false;

type PdfTextItem = { str?: string };

const getPdfJs = async () => {
  const mod = await import("pdfjs-dist/build/pdf.mjs");
  if (!configured) {
    mod.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
    configured = true;
  }
  return mod;
};

/**
 * Extract text from a PDF byte buffer using pdf.js in the browser.
 * V1 intentionally supports embedded text only; scanned PDFs should fail clearly.
 */
export const extractPdfText = async (bytes: Uint8Array) => {
  const pdfjs = await getPdfJs();
  const document = await pdfjs.getDocument({ data: bytes }).promise;

  try {
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const lines = textContent.items
        .map((item: PdfTextItem) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (lines) {
        pages.push(lines);
      }
    }

    const text = pages.join("\n\n").trim();
    if (!text) {
      throw new Error("No extractable text found in PDF. OCR is not supported in this version.");
    }

    return text;
  } finally {
    document.destroy();
  }
};
