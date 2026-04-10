/**
 * Rich content utilities for embedding HTML/SVG in chat tool results.
 *
 * Skills wrap their rich output with `wrapRichContent()`. The ToolCallBlock
 * detects the markers via `extractRichContent()` and renders inline HTML
 * with an optional download button.
 */

const OPEN_TAG = "<!--nessi:rich";
const CLOSE_TAG = "<!--/nessi:rich-->";

export type RichContentBlock = {
  html: string;
  downloadName?: string;
};

/**
 * Wrap HTML/SVG so the chat UI renders it inline instead of as plain text.
 * Persists automatically because tool stdout is stored in message history.
 */
export const wrapRichContent = (html: string, downloadName?: string) => {
  const meta = downloadName ? ` ${JSON.stringify({ download: downloadName })}` : "";
  return `${OPEN_TAG}${meta}-->\n${html}\n${CLOSE_TAG}`;
};

/**
 * Extract rich content blocks from tool stdout.
 * Returns the remaining plain text and any rich blocks found.
 */
export const extractRichContent = (text: string) => {
  const blocks: RichContentBlock[] = [];
  let remaining = text;
  let start: number;

  while ((start = remaining.indexOf(OPEN_TAG)) !== -1) {
    const metaEnd = remaining.indexOf("-->", start + OPEN_TAG.length);
    if (metaEnd < 0) break;

    const end = remaining.indexOf(CLOSE_TAG, metaEnd);
    if (end < 0) break;

    const metaStr = remaining.slice(start + OPEN_TAG.length, metaEnd).trim();
    const html = remaining.slice(metaEnd + 3, end).trim();

    let downloadName: string | undefined;
    if (metaStr) {
      try {
        const meta = JSON.parse(metaStr) as { download?: string };
        downloadName = meta.download;
      } catch { /* ignore */ }
    }

    blocks.push({ html, downloadName });
    remaining = remaining.slice(0, start) + remaining.slice(end + CLOSE_TAG.length);
  }

  return { plainText: remaining.trim(), blocks };
};

/** Convert raw SVG string to a downloadable blob URL. */
export const svgToBlobUrl = (svg: string) =>
  URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
