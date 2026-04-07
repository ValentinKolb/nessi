import { defineCommand } from "just-bash";
import type { ExecResult, Command } from "just-bash";
import type { CommandHelpers } from "./helpers.js";
import { createCommandHelpers } from "./helpers.js";

export function ok(stdout: string): ExecResult {
  return { stdout, stderr: "", exitCode: 0 };
}

export function err(msg: string): ExecResult {
  return { stdout: "", stderr: msg + "\n", exitCode: 1 };
}

/** Parse `--key value` pairs from an args array. */
export function parseArgs(args: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--") && i + 1 < args.length) {
      map.set(arg.slice(2), args[i + 1]!);
      i++;
    }
  }
  return map;
}

/** Collect positional (non-flag) args from an args array. */
export function positionalArgs(args: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith("--") && i + 1 < args.length) {
      i++; // skip value
    } else {
      result.push(arg);
    }
  }
  return result;
}

type SubcommandHandler = (args: string[], helpers: CommandHelpers) => Promise<ExecResult> | ExecResult;

type Subcommand = {
  name: string;
  usage: string;
  handler: SubcommandHandler;
};

export type CliBuilder = ReturnType<typeof cli>;

/** Build a CLI command with auto-generated help. */
export function cli(opts: { name: string; description: string }) {
  const subcommands: Subcommand[] = [];

  const builder = {
    sub(sub: { name: string; usage: string; handler: SubcommandHandler }) {
      subcommands.push(sub);
      return builder;
    },

    build(helpers?: CommandHelpers): Command {
      const h: CommandHelpers = helpers ?? createCommandHelpers();

      const helpText = [
        `${opts.name} - ${opts.description}`,
        "",
        "Usage:",
        ...subcommands.map((s) => `  ${opts.name} ${s.usage}`),
        `  ${opts.name} --help`,
        "",
      ].join("\n");

      return defineCommand(opts.name, async (args) => {
        const sub = args[0];
        if (!sub || sub === "--help" || sub === "-h") return ok(helpText);

        const match = subcommands.find((s) => s.name === sub);
        if (!match) return err(`Unknown command: ${sub}. Use '${opts.name} --help' for help.`);

        return match.handler(args.slice(1), h);
      });
    },
  };

  return builder;
}
