import { parse as parseYaml } from "yaml";

export type FrontmatterParseResult = {
  attributes: Record<string, unknown>;
  body: string;
};

const splitFrontmatter = (raw: string) => {
  const text = raw.replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n")) return null;

  const end = text.indexOf("\n---", 4);
  if (end < 0) return null;

  const fenceEnd = text.indexOf("\n", end + 4);
  const frontmatter = text.slice(4, end);
  const body = fenceEnd >= 0 ? text.slice(fenceEnd + 1) : "";
  return { frontmatter, body };
};

/** Parse markdown with optional YAML frontmatter and return attributes + body. */
export const parseFrontmatter = (raw: string): FrontmatterParseResult => {
  const split = splitFrontmatter(raw);
  if (!split) return { attributes: {}, body: raw };

  try {
    const parsed = parseYaml(split.frontmatter);
    return {
      attributes: parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {},
      body: split.body,
    };
  } catch {
    return { attributes: {}, body: split.body };
  }
};
