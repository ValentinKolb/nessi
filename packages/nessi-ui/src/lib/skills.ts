import { z } from "zod";
import { defineTool } from "nessi-core";
import type { Tool } from "nessi-core";
import { Bash, defineCommand } from "just-bash";
import type { ExecResult, Command } from "just-bash";
import { cli, ok, err, parseArgs, positionalArgs } from "./commands/cli.js";
import type { CliBuilder } from "./commands/cli.js";
import type { CommandHelpers } from "./commands/helpers.js";
import { createCommandHelpers } from "./commands/helpers.js";
import { surveyTool } from "./survey.js";
import { memoryTool } from "./tools/memory-tool.js";
import { getEnabledSkills, loadSkills, skillPath, type SkillEntry } from "./skill-registry.js";

const MAX_OUTPUT_LENGTH = 30_000;

type SnippetApi = {
  defineCommand: typeof defineCommand;
  cli: typeof cli;
  ok: typeof ok;
  err: typeof err;
  parseArgs: typeof parseArgs;
  positionalArgs: typeof positionalArgs;
  helpers: CommandHelpers;
};

type SnippetFactory = (api: SnippetApi) => Command | CliBuilder | Promise<Command | CliBuilder>;

function truncate(text: string, label: string): string {
  if (text.length <= MAX_OUTPUT_LENGTH) return text;
  return text.slice(0, MAX_OUTPUT_LENGTH) + `\n\n... [${label} truncated, ${text.length - MAX_OUTPUT_LENGTH} chars omitted]`;
}

function isCommand(value: unknown): value is Command {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { name?: unknown }).name === "string"
    && typeof (value as { execute?: unknown }).execute === "function";
}

function isCliBuilder(value: unknown): value is CliBuilder {
  return Boolean(value)
    && typeof value === "object"
    && typeof (value as { build?: unknown }).build === "function";
}

function generateReadme(skills: SkillEntry[]): string {
  const lines = ["# Skills", ""];
  for (const skill of skills) {
    const state = skill.code?.trim() ? "ready" : "docs-only";
    lines.push(`- ${skill.command}: ${skill.description} (${state}) -> \`cat ${skillPath(skill.id)}\``);
  }
  lines.push("", "Every command supports `--help`.");
  return lines.join("\n");
}

const bashToolDef = defineTool({
  name: "bash",
  description: "Run a bash command. Read /skills/README.md to discover available commands and capabilities.",
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  }),
  needsApproval: true,
});

async function loadSnippetFactory(code: string): Promise<SnippetFactory> {
  if (!code.trim()) {
    throw new Error("Skill has no implementation code.");
  }

  const blob = new Blob([code], { type: "text/javascript" });
  const url = URL.createObjectURL(blob);
  try {
    const mod = await import(/* @vite-ignore */ url);
    const candidate = mod.default ?? mod.createCommand ?? mod.factory;
    if (typeof candidate !== "function") {
      throw new Error("Snippet must export a default function (api) => Command|CliBuilder.");
    }
    return candidate as SnippetFactory;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function normalizeSnippetResult(result: Command | CliBuilder, helpers: CommandHelpers): Command {
  if (isCommand(result)) return result;
  if (isCliBuilder(result)) return result.build(helpers);
  throw new Error("Snippet returned unsupported value. Use Command or CliBuilder.");
}

async function buildCommandFromFactory(
  factory: SnippetFactory,
  helpers: CommandHelpers,
  errorPrefix: string,
): Promise<Command> {
  try {
    const api: SnippetApi = {
      defineCommand,
      cli,
      ok,
      err,
      parseArgs,
      positionalArgs,
      helpers,
    };
    const built = await factory(api);
    return normalizeSnippetResult(built, helpers);
  } catch (e) {
    throw new Error(`${errorPrefix}: ${e instanceof Error ? e.message : "unknown error"}`);
  }
}

function createSnippetProxyCommand(skill: SkillEntry, helpers: CommandHelpers): Command {
  let resolved: Command | null = null;
  let loadError: string | null = null;

  return defineCommand(skill.command, async (args, ctx) => {
    if (!resolved && !loadError) {
      try {
        const factory = await loadSnippetFactory(skill.code ?? "");
        resolved = await buildCommandFromFactory(
          factory,
          helpers,
          `skill '${skill.name}' failed to initialize`,
        );
      } catch (e) {
        loadError = e instanceof Error ? e.message : "Unknown snippet error";
      }
    }

    if (loadError || !resolved) {
      return {
        stdout: "",
        stderr: `Error: skill '${skill.name}' failed to initialize: ${loadError ?? "unknown error"}\n`,
        exitCode: 1,
      };
    }

    return resolved.execute(args, ctx);
  });
}

function createCommandForSkill(skill: SkillEntry, helpers: CommandHelpers): Command | null {
  if (!skill.code?.trim()) return null;
  return createSnippetProxyCommand(skill, helpers);
}

function buildSkillCommands(skills: SkillEntry[], helpers: CommandHelpers): Command[] {
  const commands: Command[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    if (seen.has(skill.command)) continue;
    const command = createCommandForSkill(skill, helpers);
    if (!command) continue;
    commands.push(command);
    seen.add(skill.command);
  }

  return commands;
}

/** Create a Bash instance exposing only the selected skills. */
export function createBashWithSkills(skillIds: string[], helpers: CommandHelpers, extraCommands?: Command[]): Bash {
  const allSkills = loadSkills();
  const skills = allSkills.filter((skill) => skillIds.includes(skill.id));

  const files: Record<string, string> = {
    "/skills/README.md": generateReadme(skills),
  };

  for (const skill of skills) {
    files[skillPath(skill.id)] = skill.doc;
  }

  const skillCommands = buildSkillCommands(skills, helpers);

  return new Bash({
    files,
    cwd: "/home/user",
    customCommands: [...skillCommands, ...(extraCommands ?? [])],
  });
}

/** Create the nessi-core tool wrapper for one bash runtime. */
function createBashTool(bash: Bash, helpers: CommandHelpers): Tool {
  return bashToolDef.server(async (input, ctx): Promise<ExecResult> => {
    helpers.requestApproval = ctx.requestApproval;
    helpers.requestSurvey = (surveyInput) => ctx.requestClientTool("survey", surveyInput) as Promise<{ result: string }>;
    const result = await bash.exec(input.command);
    return {
      stdout: truncate(result.stdout, "stdout"),
      stderr: truncate(result.stderr, "stderr"),
      exitCode: result.exitCode,
    };
  });
}

/** Create bash + survey + memory tools for a specific skill subset. */
export function createToolsForSkills(skillIds: string[]): Tool[] {
  const helpers = createCommandHelpers();
  const bash = createBashWithSkills(skillIds, helpers);
  return [createBashTool(bash, helpers), surveyTool, memoryTool];
}

/** Build skill list text used in system prompts (`{{skills}}`). */
export function getSkillsSummary(skillIds?: string[]): string {
  const all = loadSkills();
  const selected = skillIds
    ? all.filter((skill) => skillIds.includes(skill.id))
    : all.filter((skill) => skill.enabled);

  if (selected.length === 0) return "No skills available.";

  const lines = [
    "All skills run via bash. Read the docs before first use: `cat /skills/<name>/SKILL.md`",
    "",
  ];

  for (const skill of selected) {
    lines.push(`- ${skill.command}: ${skill.description}`);
  }

  return lines.join("\n");
}

/** Tools for the main agent (enabled skills only). */
export function createMainTools(): Tool[] {
  const helpers = createCommandHelpers();
  const enabledSkillIds = getEnabledSkills().map((skill) => skill.id);
  const bash = createBashWithSkills(enabledSkillIds, helpers);
  return [createBashTool(bash, helpers), surveyTool, memoryTool];
}
