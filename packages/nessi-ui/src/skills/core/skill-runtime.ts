import { skillPaths } from "./skill-paths.js";
import { skillRegistry } from "./skill-registry.js";

const getSkillsSummary = async (skillIds?: string[]) => {
  const all = await skillRegistry.list();
  const selected = skillIds
    ? all.filter((skill) => skillIds.includes(skill.id))
    : all.filter((skill) => skill.enabled);

  if (selected.length === 0) return "No skills available.";

  return [
    "## Skills",
    "",
    "These skills are available as bash commands. **Always prefer a skill over raw code** (no node -e, awk, python, or manual CSV parsing). Skills handle edge cases, formatting, and output automatically.",
    "",
    ...[...selected]
      .sort((a, b) => a.command.localeCompare(b.command))
      .map((skill) => `- \`${skill.command}\`: ${skill.description}`),
    "",
    "Read docs with: bash(\"cat /skills/<name>/SKILL.md\"), then run: bash(\"<command> ...\")",
  ].join("\n");
};

const buildReadme = (skillIds: string[]) => {
  const all = skillRegistry.snapshot();
  const skills = all.filter((skill) => skillIds.includes(skill.id));
  const lines = skills.map((skill) => {
    const state = skill.code?.trim() ? "ready" : "docs-only";
    const refCount = skill.references?.length ?? 0;
    const refInfo = refCount > 0 ? ` [${refCount} ref${refCount > 1 ? "s" : ""}]` : "";
    return `- ${skill.command}: ${skill.description} (${state}${refInfo}) -> \`cat ${skillPaths.doc(skill.id)}\``;
  });

  return [
    "# Skills",
    "",
    "Chat files are mounted under `/input`.",
    "Generated files should be written under `/output`.",
    "Built-in command: `pdf2text /input/file.pdf > /output/file.txt`.",
    "",
    ...lines,
    "",
    "Every command supports `--help`.",
    "Some skills have reference files under `/skills/<name>/references/` — use `ls` to discover them.",
  ].join("\n");
};

export const skillRuntime = {
  getSkillsSummary,
  buildReadme,
} as const;
