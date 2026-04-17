import type { AssistantStopReason, Usage } from "nessi-ai";
import type { UIUserContentPart } from "../../lib/chat-content.js";

export type UITextBlock = { type: "text"; text: string; isError?: boolean };
export type UIToolCallBlock = {
  type: "tool_call";
  callId: string;
  name: string;
  args: unknown;
  startedAt?: string;
  result?: unknown;
  isError?: boolean;
  approval?: "pending" | "approved" | "denied";
};
export type UIThinkingBlock = { type: "thinking"; text: string };
export type UISurveyBlock = {
  type: "survey";
  callId: string;
  title?: string;
  questions: Array<{ question: string; options: string[] }>;
  submitted: boolean;
  answers?: Record<string, string>;
};

export type UIApprovalBlock = {
  type: "approval";
  callId: string;
  message: string;
  status: "pending" | "approved" | "denied";
};

export type UICompactionBlock = {
  type: "compaction";
  title: string;
  message: string;
  sessionName: string;
  applied: boolean;
  reason: "stop" | "error" | "aborted";
  entriesBefore?: number;
  entriesAfter?: number;
  summaryPreview?: string;
  error?: string;
};

export type UIBlock = UITextBlock | UIToolCallBlock | UIThinkingBlock | UISurveyBlock | UIApprovalBlock | UICompactionBlock;

export type UIUserMessage = {
  id: string;
  role: "user";
  content: UIUserContentPart[];
  timestamp?: string;
  entrySeq?: number;
};

export type UIAssistantMeta = {
  entrySeq?: number;
  timestamp?: string;
  startedAt?: string;
  model?: string;
  usage?: Usage;
  stopReason?: AssistantStopReason;
  durationMs?: number;
};

export type UIAssistantMessage = {
  id: string;
  role: "assistant";
  blocks: UIBlock[];
  streaming?: boolean;
  meta?: UIAssistantMeta;
};

export type UIMessage = UIUserMessage | UIAssistantMessage;

export type ChatState = {
  messages: UIMessage[];
  streaming: boolean;
};
