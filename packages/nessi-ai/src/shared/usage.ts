import type { Usage } from "../types.js";

export function applyCredits(
  usage: Usage,
  creditsPerInputToken = 0,
  creditsPerOutputToken = 0,
): Usage {
  return {
    ...usage,
    creditsUsed: creditsPerInputToken * usage.input + creditsPerOutputToken * usage.output,
  };
}

export function makeUsage(input = 0, output = 0): Usage {
  return { input, output, total: input + output };
}
