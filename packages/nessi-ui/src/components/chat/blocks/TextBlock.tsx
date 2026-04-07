import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { UITextBlock } from "../types.js";

function renderMarkdown(md: string): string {
  return sanitizeHtml(marked.parse(md, { async: false }) as string, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "h1", "h2"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
  });
}

/** Render assistant markdown text content. */
export function TextBlock(props: { block: UITextBlock }) {
  return (
    <div
      class="prose prose-sm max-w-none text-block-markdown"
      innerHTML={renderMarkdown(props.block.text)}
    />
  );
}
