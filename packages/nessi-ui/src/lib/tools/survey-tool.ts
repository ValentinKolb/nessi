import { z } from "zod";
import { defineTool } from "nessi-core";

export const surveyToolDef = defineTool({
  name: "survey",
  description:
    "Show an interactive survey card to collect user choices. Use BEFORE starting complex tasks " +
    "where you need user decisions on approach, format, scope, or style. One survey replaces multiple " +
    "back-and-forth messages. Call this tool directly — do NOT use bash for surveys.\n" +
    "The questions parameter uses pipe format: \"Question? | Option A | Option B\". " +
    "Separate multiple questions with newlines. Each line needs a question followed by 2+ options separated by |.\n" +
    "Example: {\"title\":\"Setup\",\"questions\":\"Language? | TypeScript | Python | Go\\nTests? | Yes | No\"}\n" +
    "For a single choice with many options: {\"title\":\"What to analyze?\",\"questions\":\"Analysis type | Revenue | Trends | Distribution | All\"}",
  inputSchema: z.object({
    title: z.string().optional().describe("Optional heading shown above the survey card."),
    questions: z.string().describe(
      "Pipe format: \"Question? | Option A | Option B\". One line per question, 2+ options each. " +
      "Example single choice: \"What to do? | Option A | Option B | Option C\". " +
      "Example multi: \"Language? | TS | Python\\nFormat? | JSON | CSV\"",
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

  // Try JSON first (in case the model sends structured format)
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
  // Also handles lines with only 2 parts as options for a single question
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const [question, ...options] = parts;
      questions.push({ question: question!, options });
    }
  }

  // Fallback: if no valid pipe questions found but multiple lines exist,
  // treat all lines as options for a single choice (the title becomes the question)
  if (questions.length === 0 && lines.length >= 2) {
    const options: string[] = [];
    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
      // Take just the first part as the option label
      if (parts[0]) options.push(parts[0]);
    }
    if (options.length >= 2) {
      questions.push({ question: "Choose an option", options });
    }
  }

  return questions;
};

/** Client tool — nessi-core emits an action_request, ChatView renders the survey UI and pushes the result back. */
export const surveyTool = surveyToolDef.client(() => ({ result: "" }));
