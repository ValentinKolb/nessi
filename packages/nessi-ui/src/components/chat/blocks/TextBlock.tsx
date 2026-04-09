import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { UITextBlock } from "../types.js";

const normalizeChannelMarkers = (md: string) =>
  md
    .replace(/(?:&lt;\|channel&gt;|<\|channel>)\s*thought\s*(?:&lt;\|?channel\|&gt;|<\|?channel\|>)/gi, "\n\n<p><em>Thinking</em></p>\n\n")
    .replace(/(?:&lt;\|channel&gt;|<\|channel>)\s*analysis\s*(?:&lt;\|?channel\|&gt;|<\|?channel\|>)/gi, "\n\n<p><em>Analysis</em></p>\n\n")
    .replace(/(?:&lt;\|channel&gt;|<\|channel>)\s*final\s*(?:&lt;\|?channel\|&gt;|<\|?channel\|>)/gi, "\n\n")
    .replace(/(?:&lt;\|channel&gt;|<\|channel>)\s*[\w-]+\s*(?:&lt;\|?channel\|&gt;|<\|?channel\|>)/gi, "\n\n")
    .replace(/(?:&lt;\|channel&gt;|<\|channel>)/gi, "")
    .replace(/(?:&lt;\|?channel\|&gt;|<\|?channel\|>)/gi, "")
    .replace(/^[>"'\s]*thinking["'\s]*$/gim, "\n\n<p><em>Thinking</em></p>\n\n")
    .replace(/^[>"'\s]*analysis["'\s]*$/gim, "\n\n<p><em>Analysis</em></p>\n\n")
    .replace(/^\s*thought\s*$/gim, "<p><em>Thinking</em></p>")
    .replace(/^\s*analysis\s*$/gim, "<p><em>Analysis</em></p>")
    .replace(/^\s*final\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n");

const renderMarkdown = (md: string) =>
  sanitizeHtml(marked.parse(normalizeChannelMarkers(md), { async: false }) as string, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "h1", "h2"],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "title"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
  });

/** Render assistant markdown text content. */
export const TextBlock = (props: { block: UITextBlock }) => (
  <div
    class="prose prose-sm max-w-none text-block-markdown"
    innerHTML={renderMarkdown(props.block.text)}
  />
);
