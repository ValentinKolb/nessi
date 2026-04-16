import { z } from "zod";
import { defineTool } from "nessi-core";

export const surveyToolDef = defineTool({
  name: "survey",
  description:
    "Show an interactive survey card to collect user choices. Use BEFORE starting complex tasks " +
    "where you need user decisions on approach, format, scope, or style. One survey replaces multiple " +
    "back-and-forth messages. Call this tool directly — do NOT use bash for surveys.\n" +
    "The questions parameter uses a simple pipe format: \"Question? | Option A | Option B\". " +
    "Separate multiple questions with newlines.\n" +
    "Example: {\"title\":\"Project Setup\",\"questions\":\"Language? | TypeScript | Python | Go\\nInclude tests? | Yes | No\"}",
  inputSchema: z.object({
    title: z.string().optional().describe("Optional heading shown above the survey card."),
    questions: z.string().describe(
      "One question per line in pipe format: \"Question? | Option A | Option B | Option C\". " +
      "Example: \"Language? | TypeScript | Python\\nTests? | Yes | No\"",
    ),
  }),
  outputSchema: z.object({
    result: z.string().describe("The user's answers as plain-text question/answer pairs."),
  }),
  needsApproval: false,
});

/** Parse the flat pipe-format string into structured questions for the survey UI. */
export const parseSurveyQuestions = (raw: string): Array<{ question: string; options: string[] }> => {
  const questions: Array<{ question: string; options: string[] }> = [];

  // Try JSON first (in case a smarter model sends the structured format)
  if (raw.trimStart().startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.question && Array.isArray(item?.options) && item.options.length >= 2) {
            questions.push({ question: String(item.question).trim(), options: item.options.map(String) });
          }
        }
        if (questions.length > 0) return questions;
      }
    } catch { /* fall through to pipe parsing */ }
  }

  // Pipe format: "Question? | Option A | Option B"
  for (const line of raw.split("\n")) {
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const [question, ...options] = parts;
      questions.push({ question: question!, options });
    }
  }

  return questions;
};

/** Client tool — nessi-core emits an action_request, ChatView renders the survey UI and pushes the result back. */
export const surveyTool = surveyToolDef.client(() => ({ result: "" }));
