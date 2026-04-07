import { z } from "zod";
import { defineTool } from "nessi-core";

export type SurveyQuestion = {
  question: string;
  options: string[];
};

const surveyInputSchema = z.object({
  title: z.string().optional(),
  questions: z.array(z.object({
    question: z.string(),
    options: z.array(z.string()),
  })),
});

const surveyOutputSchema = z.object({
  result: z.string(),
});

export const surveyTool = defineTool({
  name: "survey",
  description: "Ask the user multiple single-choice questions at once. Each question has a list of options the user can pick from. Use this instead of asking questions one by one in text. The result is a plain text string with question/answer pairs.",
  inputSchema: surveyInputSchema,
  outputSchema: surveyOutputSchema,
}).client(() => ({ result: "" })); // no-op — UI handles the interaction
