import { skillPaths } from "./skill-paths.js";
import { skillRegistry } from "./skill-registry.js";

const getSkillsSummary = async (skillIds?: string[]) => {
  const all = await skillRegistry.list();
  const selected = skillIds
    ? all.filter((skill) => skillIds.includes(skill.id))
    : all.filter((skill) => skill.enabled);

  if (selected.length === 0) return "No skills available.";

  const skillLines: string[] = [];
  for (const skill of [...selected].sort((a, b) => a.command.localeCompare(b.command))) {
    const refCount = skill.references?.length ?? 0;
    const refs = refCount > 0 ? ` [${refCount} reference${refCount > 1 ? "s" : ""}]` : "";
    skillLines.push(`- \`${skill.command}\`: ${skill.description}${refs}`);
  }

  return [
    "## Skills",
    "",
    "These skills are bash commands. **Always prefer a skill over raw code.** Read the SKILL.md before using any skill — don't guess syntax.",
    "",
    ...skillLines,
  ].join("\n");
};

const buildReadme = (skillIds: string[]) => {
  const all = skillRegistry.snapshot();
  const skills = all.filter((skill) => skillIds.includes(skill.id));
  const lines: string[] = [];
  for (const skill of skills) {
    const state = skill.code?.trim() ? "ready" : "docs-only";
    lines.push(`- ${skill.command}: ${skill.description} (${state}) -> \`cat ${skillPaths.doc(skill.id)}\``);
    if (skill.references && skill.references.length > 0) {
      for (const ref of skill.references) {
        lines.push(`    - \`cat ${skillPaths.reference(skill.id, ref.name)}\``);
      }
    }
  }

  return [
    "# Skills",
    "",
    "Chat files are mounted under `/input`.",
    "Generated files should be written under `/output`.",
    "Built-in command: `pdf2text /input/file.pdf > /output/file.txt`.",
    "",
    "**Read the SKILL.md before using any skill.** If a skill has reference files listed below, read relevant ones too.",
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
