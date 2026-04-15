import { createEffect, onCleanup } from "solid-js";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { UITextBlock } from "../types.js";

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

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
      code: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
  });

// ---------------------------------------------------------------------------
// Language → icon + display name
// ---------------------------------------------------------------------------

const LANG_META: Record<string, { icon: string; label: string }> = {
  python: { icon: "ti-brand-python", label: "Python" },
  py: { icon: "ti-brand-python", label: "Python" },
  javascript: { icon: "ti-brand-javascript", label: "JavaScript" },
  js: { icon: "ti-brand-javascript", label: "JavaScript" },
  typescript: { icon: "ti-brand-typescript", label: "TypeScript" },
  ts: { icon: "ti-brand-typescript", label: "TypeScript" },
  jsx: { icon: "ti-brand-javascript", label: "JSX" },
  tsx: { icon: "ti-brand-typescript", label: "TSX" },
  rust: { icon: "ti-brand-rust", label: "Rust" },
  rs: { icon: "ti-brand-rust", label: "Rust" },
  go: { icon: "ti-brand-golang", label: "Go" },
  golang: { icon: "ti-brand-golang", label: "Go" },
  html: { icon: "ti-brand-html5", label: "HTML" },
  css: { icon: "ti-brand-css3", label: "CSS" },
  json: { icon: "ti-json", label: "JSON" },
  sql: { icon: "ti-sql", label: "SQL" },
  yaml: { icon: "ti-file-type-txt", label: "YAML" },
  yml: { icon: "ti-file-type-txt", label: "YAML" },
  toml: { icon: "ti-file-type-txt", label: "TOML" },
  xml: { icon: "ti-file-type-xml", label: "XML" },
  markdown: { icon: "ti-markdown", label: "Markdown" },
  md: { icon: "ti-markdown", label: "Markdown" },
  bash: { icon: "ti-terminal", label: "Bash" },
  sh: { icon: "ti-terminal", label: "Shell" },
  shell: { icon: "ti-terminal", label: "Shell" },
  zsh: { icon: "ti-terminal", label: "Shell" },
  c: { icon: "ti-brand-cpp", label: "C" },
  cpp: { icon: "ti-brand-cpp", label: "C++" },
  "c++": { icon: "ti-brand-cpp", label: "C++" },
  java: { icon: "ti-coffee", label: "Java" },
  ruby: { icon: "ti-diamond", label: "Ruby" },
  rb: { icon: "ti-diamond", label: "Ruby" },
  php: { icon: "ti-brand-php", label: "PHP" },
  swift: { icon: "ti-brand-swift", label: "Swift" },
  kotlin: { icon: "ti-brand-kotlin", label: "Kotlin" },
  docker: { icon: "ti-brand-docker", label: "Dockerfile" },
  dockerfile: { icon: "ti-brand-docker", label: "Dockerfile" },
  lua: { icon: "ti-moon", label: "Lua" },
  r: { icon: "ti-chart-dots", label: "R" },
  csv: { icon: "ti-table", label: "CSV" },
  svg: { icon: "ti-file-vector", label: "SVG" },
  diff: { icon: "ti-diff", label: "Diff" },
  ini: { icon: "ti-settings", label: "INI" },
  nginx: { icon: "ti-server", label: "Nginx" },
  graphql: { icon: "ti-api", label: "GraphQL" },
};

const DEFAULT_META = { icon: "ti-code", label: "Code" };

const getLangFromCode = (code: HTMLElement): string | null => {
  const cls = code.className ?? "";
  const match = cls.match(/language-(\S+)/);
  return match ? match[1]!.toLowerCase() : null;
};

// ---------------------------------------------------------------------------
// Inject code block headers
// ---------------------------------------------------------------------------

const addCodeHeaders = (container: HTMLElement) => {
  for (const pre of Array.from(container.querySelectorAll("pre"))) {
    if (pre.querySelector(".code-header")) continue;
    const code = pre.querySelector("code");
    if (!code) continue;

    const lang = getLangFromCode(code);
    const meta: { icon: string; label: string } =
      (lang ? LANG_META[lang] : undefined) ?? (lang ? { icon: "ti-code", label: lang } : DEFAULT_META);

    // Header bar
    const header = document.createElement("div");
    header.className = "code-header";
    const langEl = document.createElement("span");
    langEl.className = "code-header-lang";
    langEl.innerHTML = `<span class="i ti ${meta.icon}"></span><span>${meta.label}</span>`;

    const btn = document.createElement("button");
    btn.className = "code-copy-btn icon-action i ti ti-copy";
    btn.title = "Copy";
    btn.addEventListener("click", () => {
      void navigator.clipboard.writeText(code.textContent ?? "").then(() => {
        btn.className = "code-copy-btn icon-action i ti ti-check";
        setTimeout(() => {
          btn.className = "code-copy-btn icon-action i ti ti-copy";
        }, 1500);
      });
    });

    header.appendChild(langEl);
    header.appendChild(btn);

    pre.insertBefore(header, pre.firstChild);
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Render assistant markdown text content. */
export const TextBlock = (props: { block: UITextBlock }) => {
  let ref!: HTMLDivElement;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  createEffect(() => {
    const _text = props.block.text; // track reactive dependency
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (ref) addCodeHeaders(ref);
    }, 250);
  });

  onCleanup(() => {
    if (debounce) clearTimeout(debounce);
  });

  return (
    <div
      ref={ref}
      class="prose prose-sm max-w-none text-block-markdown"
      innerHTML={renderMarkdown(props.block.text)}
    />
  );
};
