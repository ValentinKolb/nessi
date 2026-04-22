import type { UIBlock, UICardBlock, UISurveyBlock } from "../components/chat/types.js";
import { isPresentResult } from "../components/chat/blocks/PresentContent.js";
import { parseSurveyQuestions } from "./tools/survey-tool.js";

/**
 * Handlers let a tool emit a "companion" UI block that sits next to the generic
 * tool_call block. `fromArgs` fires when the tool args arrive, `fromResult` when
 * the tool result comes in. A `fromResult` return that is a full `UIBlock`
 * appends a new block; a `Partial<UIBlock>` patches the existing companion.
 */
export type InlineToolHandler = {
  fromArgs?: (args: unknown, callId: string) => UIBlock | null;
  fromResult?: (result: unknown, args: unknown, callId: string) => UIBlock | Partial<UIBlock> | null;
};

const parseSurveyAnswers = (result: unknown): Record<string, string> | undefined => {
  const text = result && typeof result === "object" && "result" in result
    ? String((result as Record<string, unknown>).result ?? "")
    : typeof result === "string" ? result : "";
  if (!text) return undefined;
  const answers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const sep = line.indexOf(":");
    if (sep > 0) answers[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return Object.keys(answers).length > 0 ? answers : undefined;
};

export const inlineToolHandlers: Record<string, InlineToolHandler> = {
  card: {
    fromArgs(args): UICardBlock {
      const a = args as { layout?: UICardBlock["layout"]; data?: Record<string, unknown>; content?: string };
      return { type: "card", layout: a.layout, data: a.data, content: a.content };
    },
  },

  survey: {
    fromArgs(args, callId): UISurveyBlock | null {
      const a = args as { title?: string; questions?: string | Array<{ question: string; options: string[] }> };
      const questions = typeof a.questions === "string"
        ? parseSurveyQuestions(a.questions)
        : Array.isArray(a.questions) ? a.questions : [];
      if (questions.length === 0) return null;
      return {
        type: "survey",
        callId,
        title: a.title,
        questions,
        submitted: false,
      };
    },
    fromResult(result): Partial<UISurveyBlock> {
      return { submitted: true, answers: parseSurveyAnswers(result) };
    },
  },

  present: {
    fromResult(result, _args, callId) {
      if (!isPresentResult(result)) return null;
      return { type: "present", callId, result };
    },
  },
};
