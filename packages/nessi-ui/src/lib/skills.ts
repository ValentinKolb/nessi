import { z } from "zod";
import { defineTool } from "nessi-core";
import type { Tool } from "nessi-core";
import { Bash, defineCommand } from "just-bash";
import type { IFileSystem } from "just-bash";
import type { ExecResult, Command, InitialFiles } from "just-bash";
import { cli, ok, err, parseArgs, positionalArgs } from "./commands/cli.js";
import type { CliBuilder } from "./commands/cli.js";
import type { CommandHelpers } from "./commands/helpers.js";
import { createCommandHelpers } from "./commands/helpers.js";
import { memoryAddTool, memoryRemoveTool, memoryReplaceTool, memoryRecallTool } from "./tools/memory-tool.js";
import { createPresentTool } from "./tools/present-tool.js";
import { nextcloudApi } from "./nextcloud.js";
import { createNextcloudFs } from "./nextcloud-fs.js";
import { listCachedSkills, listEnabledCachedSkills, skillPath, skillReferencePath, type SkillEntry } from "./skill-registry.js";
import type { ChatFileService } from "./file-service.js";
import { extractPdfText } from "../skills/builtins/pdf/pdf-text.js";
import { webTool } from "../skills/builtins/web/web-tool.js";
import { surveyTool } from "./tools/survey-tool.js";
import { cardTool } from "./tools/card-tool.js";
import { skillRuntime } from "../skills/core/index.js";
import { createGitHubFs } from "./github-fs.js";
import { truncateText } from "./utils.js";

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

const isCommand = (value: unknown): value is Command =>
  Boolean(value)
  && typeof value === "object"
  && typeof (value as { name?: unknown }).name === "string"
  && typeof (value as { execute?: unknown }).execute === "function";

const isCliBuilder = (value: unknown): value is CliBuilder =>
  Boolean(value)
  && typeof value === "object"
  && typeof (value as { build?: unknown }).build === "function";

const bashToolDef = defineTool({
  name: "bash",
  description:
    "Run a bash command. Use this for shell commands, pipelines, and skills. For large file reads prefer read_file. For writing or editing files prefer write_file or edit_file. Example input: {\"command\":\"ls /input && readlink /output || true\"}. Read /skills/README.md to discover available commands and capabilities.",
  inputSchema: z.object({
    command: z.string().describe(
      "The bash command to execute. Example: 'ls /input && wc -l /output/result.txt'",
    ),
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number(),
  }),
  needsApproval: false,
});

const listFilesToolDef = defineTool({
  name: "list_files",
  description:
    "List mounted chat files under /input and generated files under /output. Example input: {\"scope\":\"all\"}. Use this to see what files are available before reading or editing.",
  inputSchema: z.object({
    scope: z.enum(["input", "output", "all"]).optional().describe(
      "Optional scope filter. Use 'input', 'output', or 'all'. Default is 'all'.",
    ),
  }),
  outputSchema: z.object({
    files: z.array(z.object({
      path: z.string(),
      name: z.string(),
      kind: z.enum(["input", "output"]),
      mimeType: z.string(),
      size: z.number(),
      createdAt: z.string(),
    })),
    counts: z.object({
      input: z.number(),
      output: z.number(),
    }),
  }),
});

const readFileToolDef = defineTool({
  name: "read_file",
  description:
    "Read a mounted text/code file or PDF with line ranges. Prefer this over cat for larger files. Example input: {\"path\":\"/input/notes.md\",\"offset\":1,\"limit\":200}.",
  inputSchema: z.object({
    path: z.string().describe(
      "Absolute mounted file path to read. Usually under /input or /output. Example: '/input/notes.md'",
    ),
    offset: z.coerce.number().int().positive().optional().describe(
      "Optional 1-based start line. Default is 1.",
    ),
    limit: z.coerce.number().int().positive().optional().describe(
      "Optional number of lines to return. Default is 200, maximum is 400.",
    ),
  }),
  outputSchema: z.object({
    path: z.string(),
    mimeType: z.string(),
    content: z.string(),
    totalLines: z.number(),
    linesReturned: z.number(),
    truncated: z.boolean(),
  }),
});

const writeFileToolDef = defineTool({
  name: "write_file",
  description:
    "Write a new file or overwrite an existing one under /output. Use this instead of pasting file contents into chat. Example input: {\"path\":\"/output/summary.md\",\"content\":\"# Summary\\n...\"}.",
  inputSchema: z.object({
    path: z.string().describe(
      "Target path under /output. Example: '/output/summary.md'",
    ),
    content: z.string().describe("Full file contents to write."),
    overwrite: z.boolean().optional().describe(
      "Whether an existing /output file may be overwritten. Default is true.",
    ),
  }),
  outputSchema: z.object({
    path: z.string(),
    bytesWritten: z.number(),
    created: z.boolean(),
  }),
});

const editFileToolDef = defineTool({
  name: "edit_file",
  description:
    "Edit an existing text/code file with exact string replacement and write the result under /output. Prefer this over bash heredocs for file edits. Example input: {\"path\":\"/input/app.ts\",\"oldString\":\"foo\",\"newString\":\"bar\"}.",
  inputSchema: z.object({
    path: z.string().describe(
      "Source path to edit. Can be under /input or /output. Example: '/input/app.ts'",
    ),
    oldString: z.string().describe("Exact text to find in the source file."),
    newString: z.string().describe("Replacement text."),
    replaceAll: z.boolean().optional().describe(
      "Replace all matching occurrences instead of just the first one.",
    ),
    outputPath: z.string().optional().describe(
      "Optional explicit target path under /output. Example: '/output/app-edited.ts'",
    ),
  }),
  outputSchema: z.object({
    sourcePath: z.string(),
    outputPath: z.string(),
    replacements: z.number(),
  }),
});

const loadSnippetFactory = async (code: string) => {
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
};

const normalizeSnippetResult = (result: Command | CliBuilder, helpers: CommandHelpers): Command => {
  if (isCommand(result)) return result;
  if (isCliBuilder(result)) return result.build(helpers);
  throw new Error("Snippet returned unsupported value. Use Command or CliBuilder.");
};

const buildCommandFromFactory = async (
  factory: SnippetFactory,
  helpers: CommandHelpers,
  errorPrefix: string,
) => {
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
};

const createPdfToTextCommand = (): Command =>
  defineCommand("pdf2text", async (args, ctx) => {
    const path = args[0];
    if (!path) {
      return err("Usage: pdf2text /input/file.pdf");
    }

    try {
      const bytes = await ctx.fs.readFileBuffer(ctx.fs.resolvePath(ctx.cwd, path));
      const text = await extractPdfText(bytes);
      return ok(text.endsWith("\n") ? text : `${text}\n`);
    } catch (error) {
      return err(error instanceof Error ? error.message : "Failed to extract PDF text.");
    }
  });

const createFileTools = (fileService: ChatFileService): Tool[] => [
  listFilesToolDef.server(async (input) => fileService.list(input.scope)),
  readFileToolDef.server(async (input) => fileService.read(input.path, input.offset, input.limit)),
  writeFileToolDef.server(async (input) => fileService.write(input.path, input.content, input.overwrite)),
  editFileToolDef.server(async (input) =>
    fileService.edit(input.path, input.oldString, input.newString, input.replaceAll, input.outputPath),
  ),
];

const createSnippetProxyCommand = (skill: SkillEntry, helpers: CommandHelpers): Command => {
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
};

const createCommandForSkill = (skill: SkillEntry, helpers: CommandHelpers) => {
  if (!skill.code?.trim()) return null;
  return createSnippetProxyCommand(skill, helpers);
};

const buildSkillCommands = (skills: SkillEntry[], helpers: CommandHelpers) => {
  const seen = new Set<string>();
  return skills.flatMap((skill) => {
    if (seen.has(skill.command)) return [];
    seen.add(skill.command);
    const command = createCommandForSkill(skill, helpers);
    return command ? [command] : [];
  });
};

/** Wrap a bash fs to route /nextcloud/ paths to NextcloudFs. */
const wrapWithNextcloud = (base: IFileSystem): IFileSystem => {
  let ncFs: IFileSystem | null = null;
  try {
    nextcloudApi.user(); // check if configured
    ncFs = createNextcloudFs(nextcloudApi);
  } catch {
    return base; // not configured, no wrapping
  }

  const NC = "/nextcloud";
  const isNc = (p: string) => p === NC || p.startsWith(NC + "/");
  const ncPath = (p: string) => p.slice(NC.length) || "/";

  return new Proxy(base, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val !== "function" || !ncFs) return val;

      return (...args: unknown[]) => {
        const path = typeof args[0] === "string" ? args[0] : null;
        if (path && isNc(path)) {
          const ncArgs = [ncPath(path), ...args.slice(1)] as Parameters<typeof val>;
          const ncMethod = Reflect.get(ncFs, prop);
          if (typeof ncMethod === "function") {
            return ncMethod.call(ncFs, ...ncArgs);
          }
        }
        // Special: readdir at root should include "nextcloud"
        if (prop === "readdir" && path === "/") {
          return (val as (...a: unknown[]) => Promise<string[]>)(...args).then((entries: string[]) =>
            entries.includes("nextcloud") ? entries : [...entries, "nextcloud"],
          );
        }
        if (prop === "exists" && path === NC) return Promise.resolve(true);
        if (prop === "stat" && path === NC) return Promise.resolve({ isFile: false, isDirectory: true, isSymbolicLink: false, mode: 0o755, size: 0, mtime: new Date() });
        // resolvePath is not async
        if (prop === "resolvePath") return val.call(target, ...args);
        return val.call(target, ...args);
      };
    },
  });
};

/** Wrap a bash fs to route /github/ paths to GitHubFs. */
const wrapWithGitHub = (base: IFileSystem): IFileSystem => {
  const ghFs = createGitHubFs();

  const GH = "/github";
  const isGh = (p: string) => p === GH || p.startsWith(GH + "/");
  const ghPath = (p: string) => p.slice(GH.length) || "/";

  return new Proxy(base, {
    get(target, prop, receiver) {
      const val = Reflect.get(target, prop, receiver);
      if (typeof val !== "function") return val;

      return (...args: unknown[]) => {
        const path = typeof args[0] === "string" ? args[0] : null;
        if (path && isGh(path)) {
          const ghArgs = [ghPath(path), ...args.slice(1)] as Parameters<typeof val>;
          const ghMethod = Reflect.get(ghFs, prop);
          if (typeof ghMethod === "function") {
            return ghMethod.call(ghFs, ...ghArgs);
          }
        }
        if (prop === "readdir" && path === "/") {
          return (val as (...a: unknown[]) => Promise<string[]>)(...args).then((entries: string[]) =>
            entries.includes("github") ? entries : [...entries, "github"],
          );
        }
        if (prop === "exists" && path === GH) return Promise.resolve(true);
        if (prop === "stat" && path === GH) return Promise.resolve({ isFile: false, isDirectory: true, isSymbolicLink: false, mode: 0o755, size: 0, mtime: new Date() });
        if (prop === "resolvePath") return val.call(target, ...args);
        return val.call(target, ...args);
      };
    },
  });
};

/** Create a Bash instance exposing only the selected skills. */
export const createBashWithSkills = (
  skillIds: string[],
  helpers: CommandHelpers,
  extraCommands?: Command[],
  initialFiles?: InitialFiles,
) => {
  const allSkills = listCachedSkills();
  const skills = allSkills.filter((skill) => skillIds.includes(skill.id));

  const files: InitialFiles = {
    ...(initialFiles ?? {}),
    "/skills/README.md": skillRuntime.buildReadme(skillIds),
  };

  for (const skill of skills) {
    files[skillPath(skill.id)] = skill.doc;
    if (skill.references) {
      for (const ref of skill.references) {
        files[skillReferencePath(skill.id, ref.name)] = ref.content;
      }
    }
  }

  const skillCommands = buildSkillCommands(skills, helpers);

  const bash = new Bash({
    files,
    cwd: "/home/user",
    customCommands: [...skillCommands, ...(extraCommands ?? [])],
  });

  // Mount Nextcloud at /nextcloud/ and GitHub at /github/ via fs proxy
  let wrappedFs = wrapWithNextcloud(bash.fs);
  wrappedFs = wrapWithGitHub(wrappedFs);
  (bash as { fs: IFileSystem }).fs = wrappedFs;

  return bash;
};

/** Create the nessi-core tool wrapper for one bash runtime. */
const createBashToolWithHook = (
  bash: Bash,
  helpers: CommandHelpers,
  afterExec?: (bash: Bash) => Promise<void> | void,
): Tool =>
  bashToolDef.server(async (input, ctx): Promise<ExecResult> => {
    helpers.requestApproval = ctx.requestApproval;
    helpers.requestSurvey = (surveyInput) => ctx.requestClientTool("survey", surveyInput) as Promise<{ result: string }>;
    const result = await bash.exec(input.command);
    await afterExec?.(bash);
    return {
      stdout: truncateText(result.stdout, MAX_OUTPUT_LENGTH, "stdout"),
      stderr: truncateText(result.stderr, MAX_OUTPUT_LENGTH, "stderr"),
      exitCode: result.exitCode,
    };
  });

export const createMainBashRuntime = (options?: {
  initialFiles?: InitialFiles;
  afterExec?: (bash: Bash) => Promise<void> | void;
  fileService?: ChatFileService;
}) => {
  const helpers = createCommandHelpers();
  if (options?.fileService) {
    helpers.files.readBytes = async (path) => (await options.fileService!.readBytes(path)).bytes;
  }
  const enabledSkillIds = listEnabledCachedSkills().map((skill) => skill.id);
  const bash = createBashWithSkills(
    enabledSkillIds,
    helpers,
    [createPdfToTextCommand()],
    options?.initialFiles,
  );

  return {
    bash,
    tools: [
      memoryAddTool,
      memoryRemoveTool,
      memoryReplaceTool,
      memoryRecallTool,
      webTool,
      surveyTool,
      cardTool,
      ...(options?.fileService ? [...createFileTools(options.fileService), createPresentTool(options.fileService)] : []),
      createBashToolWithHook(bash, helpers, options?.afterExec),
    ] satisfies Tool[],
  };
};
