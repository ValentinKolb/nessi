export type SlashCommand = {
  name: string;
  description: string;
  action: () => void | Promise<void>;
};

const commands: SlashCommand[] = [];

/** Register a slash command once by its unique name. */
export function registerCommand(cmd: SlashCommand) {
  const idx = commands.findIndex((c) => c.name === cmd.name);
  if (idx >= 0) commands[idx] = cmd;
  else commands.push(cmd);
}

/** Get all currently registered slash commands. */
export function getCommands(): SlashCommand[] {
  return commands;
}

/** Match commands by prefix (e.g. "cl" matches "clear"). */
export function matchCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  return commands.filter((c) => c.name.startsWith(q));
}
