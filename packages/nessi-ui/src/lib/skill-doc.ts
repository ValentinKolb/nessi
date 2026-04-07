import { stringify as stringifyYaml } from "yaml";
import { parseFrontmatter } from "./frontmatter.js";

export type SkillDocMeta = {
  name: string;
  description: string;
  command: string;
  enabled: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hashCommandSeed(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

export function slugifySkillCommand(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `skill-${hashCommandSeed(input)}`;
}

function defaultSkillBody(name: string, command: string): string {
  return `# ${name}

Short summary of what this skill does and when it should be used.

## Commands

| Command | Purpose |
| --- | --- |
| \`${command} --help\` | Show the available subcommands and flags |

## Examples

\`\`\`bash
${command} --help
\`\`\`

## Notes

- Explain important assumptions or limits here.
- Mention any required settings or API keys here.
`;
}

export function createSkillDocTemplate(name = "my-skill", enabled = true): string {
  const command = slugifySkillCommand(name);
  return `---
${stringifyYaml({
    name,
    description: "Describe when and why this skill should be used.",
    metadata: {
      nessi: {
        command,
        enabled,
      },
    },
  }).trimEnd()}
---

${defaultSkillBody(name, command)}`;
}

export function readSkillDocMeta(raw: string): SkillDocMeta | null {
  const { attributes } = parseFrontmatter(raw);
  const name = asString(attributes.name);
  const description = asString(attributes.description);
  if (!name || !description) return null;

  const metadata = asRecord(attributes.metadata);
  const nessi = asRecord(metadata?.nessi);

  return {
    name,
    description,
    command: asString(nessi?.command) ?? slugifySkillCommand(name),
    enabled: typeof nessi?.enabled === "boolean" ? nessi.enabled : true,
  };
}

export function syncSkillDoc(raw: string, input: { name: string; enabled?: boolean }): string {
  const existingMeta = readSkillDocMeta(raw);
  const parsed = parseFrontmatter(raw);
  const attributes = parsed.attributes;
  const metadata = asRecord(attributes.metadata) ?? {};
  const nessi = asRecord(metadata.nessi) ?? {};
  const { impl: _legacyImpl, ...restNessi } = nessi;

  const name = input.name.trim() || existingMeta?.name || "my-skill";
  const command = asString(restNessi.command) ?? existingMeta?.command ?? slugifySkillCommand(name);
  const description = asString(attributes.description) ?? existingMeta?.description ?? "Describe when and why this skill should be used.";
  const enabled = input.enabled ?? existingMeta?.enabled ?? (typeof restNessi.enabled === "boolean" ? restNessi.enabled : true);

  const nextAttributes = {
    ...attributes,
    name,
    description,
    metadata: {
      ...metadata,
      nessi: {
        ...restNessi,
        command,
        enabled,
      },
    },
  };

  const body = parsed.body.trim()
    ? parsed.body.trimStart()
    : defaultSkillBody(name, command);

  return `---
${stringifyYaml(nextAttributes).trimEnd()}
---

${body}`;
}
