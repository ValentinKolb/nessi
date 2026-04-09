export const SNIPPET_TEMPLATE = `/**
 * Export default function create(api) => Command | CliBuilder
 *
 * Use the nessi snippet API only:
 * - api.defineCommand(name, handler)
 * - api.cli({ name, description }).sub(...).build()
 * - api.ok / api.err / api.parseArgs / api.positionalArgs
 * - api.helpers.requestApproval / api.helpers.requestSurvey
 */
export default function create(api) {
  const { defineCommand, ok, parseArgs, positionalArgs } = api;

  return defineCommand("hello", async (args) => {
    const flags = parseArgs(args);
    const name = flags.get("name") ?? positionalArgs(args)[0] ?? "world";
    return ok(\`Hello \${name}\\n\`);
  });
}
`;
