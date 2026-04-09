import type { UIMessage, UIAssistantMessage, UIUserMessage } from "./types.js";

export const isAssistantMessage = (message: UIMessage | undefined): message is UIAssistantMessage =>
  message?.role === "assistant";

export const isUserMessage = (message: UIMessage | undefined): message is UIUserMessage =>
  message?.role === "user";
