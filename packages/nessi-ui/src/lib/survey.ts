import { z } from "zod";
import { defineTool } from "nessi-core";

export type SurveyQuestion = {
  question: string;
  options: string[];
};

const surveyQuestionSchema = z.object({
  question: z.string().describe("The question to ask the user. Example: 'Which language should I use?'"),
  options: z.array(z.string()).describe(
    "Answer options shown as buttons. Keep them short. Example: ['Deutsch', 'English']",
  ),
});

const surveyInputSchema = z.object({
  title: z.string().optional().describe("Short survey title. Example: 'Language preference'"),
  questions: z.array(surveyQuestionSchema).default([]).describe(
    "Always pass a non-empty questions array. Never call survey with {}. Example: [{\"question\":\"Preferred language?\",\"options\":[\"Deutsch\",\"English\"]}]",
  ),
});

const surveyOutputSchema = z.object({
  result: z.string(),
});

export const surveyTool = defineTool({
  name: "survey",
  description:
    "Ask the user structured questions in one batch. Prefer this whenever you need more information from the user, when they need to make a choice, when you want to confirm assumptions, or when multiple follow-up questions would otherwise happen in chat. Always pass a non-empty questions array. Never call this tool with {}. Example input: {\"title\":\"Language preference\",\"questions\":[{\"question\":\"Preferred language?\",\"options\":[\"Deutsch\",\"English\"]}]}. Each question includes buttons and a free-text field for extra context. The result is a plain text string with question/answer pairs.",
  inputSchema: surveyInputSchema,
  outputSchema: surveyOutputSchema,
}).client(() => ({ result: "" })); // no-op — UI handles the interaction
