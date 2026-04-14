import { skillPaths } from "./skill-paths.js";
import { skillRegistry } from "./skill-registry.js";

const getSkillsSummary = async (skillIds?: string[]) => {
  const all = await skillRegistry.list();
  const selected = skillIds
    ? all.filter((skill) => skillIds.includes(skill.id))
    : all.filter((skill) => skill.enabled);

  if (selected.length === 0) return "No skills available.";

  return [
    "Available skills (bash commands):",
    "",
    ...[...selected]
      .sort((a, b) => a.command.localeCompare(b.command))
      .map((skill) => `- ${skill.command}: ${skill.description}`),
    "",
    "Before using a skill for the first time, read its docs: `cat /skills/<name>/SKILL.md`",
  ].join("\n");
};

const buildReadme = (skillIds: string[]) => {
  const all = skillRegistry.snapshot();
  const skills = all.filter((skill) => skillIds.includes(skill.id));
  const lines = skills.map((skill) => {
    const state = skill.code?.trim() ? "ready" : "docs-only";
    return `- ${skill.command}: ${skill.description} (${state}) -> \`cat ${skillPaths.doc(skill.id)}\``;
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
  ].join("\n");
};

export const skillRuntime = {
  getSkillsSummary,
  buildReadme,
} as const;
