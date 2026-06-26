import type { Usage } from "../types.js";

export const applyCredits = (
  usage: Usage,
  creditsPerInputToken = 0,
  creditsPerOutputToken = 0,
): Usage => ({
  ...usage,
  creditsUsed: creditsPerInputToken * usage.input + creditsPerOutputToken * usage.output,
});

export const makeUsage = (input = 0, output = 0): Usage =>
  ({ input, output, total: input + output });
