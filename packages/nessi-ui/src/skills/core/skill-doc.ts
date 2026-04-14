import { stringify as stringifyYaml } from "yaml";
import { parseFrontmatter } from "../../lib/frontmatter.js";
import { asRecord, asString } from "../../lib/utils.js";

export type SkillDocMeta = {
  name: string;
  description: string;
  command: string;
  enabled: boolean;
};

const hashCommandSeed = (input: string) => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 6);
};

const slugifyCommand = (input: string) => {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `skill-${hashCommandSeed(input)}`;
};

const defaultSkillBody = (name: string, command: string) =>
  `# ${name}

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

const createTemplate = (name = "my-skill", enabled = true) => {
  const command = slugifyCommand(name);
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
};

const readMeta = (raw: string): SkillDocMeta | null => {
  const { attributes } = parseFrontmatter(raw);
  const name = asString(attributes.name);
  const description = asString(attributes.description);
  if (!name || !description) return null;

  const metadata = asRecord(attributes.metadata);
  const nessi = asRecord(metadata?.nessi);

  return {
    name,
    description,
    command: asString(nessi?.command) ?? slugifyCommand(name),
    enabled: typeof nessi?.enabled === "boolean" ? nessi.enabled : true,
  };
};

const syncDoc = (raw: string, input: { name: string; enabled?: boolean }) => {
  const existingMeta = readMeta(raw);
  const parsed = parseFrontmatter(raw);
  const attributes = parsed.attributes;
  const metadata = asRecord(attributes.metadata) ?? {};
  const nessi = asRecord(metadata.nessi) ?? {};
  const { impl: _legacyImpl, ...restNessi } = nessi;

  const name = input.name.trim() || existingMeta?.name || "my-skill";
  const command = asString(restNessi.command) ?? existingMeta?.command ?? slugifyCommand(name);
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

  const body = parsed.body.trim() ? parsed.body.trimStart() : defaultSkillBody(name, command);
  return `---
${stringifyYaml(nextAttributes).trimEnd()}
---

${body}`;
};

export const skillDoc = {
  slugifyCommand,
  createTemplate,
  readMeta,
  syncDoc,
} as const;
