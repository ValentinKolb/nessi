import { settingsRepo, type CompactionSettings } from "../domains/settings/index.js";

export type { CompactionSettings } from "../domains/settings/index.js";

export const loadCompactionSettings = () => settingsRepo.loadCompactionSettings();
export const saveCompactionSettings = (settings: CompactionSettings) => settingsRepo.saveCompactionSettings(settings);

const DEFAULT_COMPACTION_PROMPT = `You summarize conversations for a personal assistant called nessi.

<conversation>
{{conversation}}
</conversation>

Write a checkpoint summary of the conversation above. The assistant will read this summary instead of the original messages, so include everything needed to continue the conversation naturally.

What to include:
- The user's goal and why they need it
- Actions taken: tools used, commands run, files changed
- Results: what worked, what failed, key outputs
- Decisions made and their reasoning
- Open tasks, unresolved questions, or next steps
- Specific details: names, versions, paths, config values, error messages

What to skip:
- Greetings and small talk
- Repeated failed attempts (only the final outcome matters)
- Verbose tool output (summarize the result instead)

Write 5-15 sentences. Be specific and factual. Use the same terminology as the conversation.`;

export const getCompactionPrompt = async () =>
  await settingsRepo.getCompactionPrompt() ?? DEFAULT_COMPACTION_PROMPT;

export const setCompactionPrompt = async (prompt: string) =>
  settingsRepo.setCompactionPrompt(prompt);

export const resetCompactionPrompt = async () => {
  await settingsRepo.setCompactionPrompt(DEFAULT_COMPACTION_PROMPT);
  return DEFAULT_COMPACTION_PROMPT;
};

export const getDefaultCompactionPrompt = () => DEFAULT_COMPACTION_PROMPT;
