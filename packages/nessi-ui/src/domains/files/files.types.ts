export type ChatFileKind = "input" | "output";
export type ChatFileSourceType = "text" | "pdf" | "table" | "image" | "generated";

export type ChatFileMeta = {
  id: string;
  chatId: string;
  name: string;
  mimeType: string;
  size: number;
  kind: ChatFileKind;
  sourceType: ChatFileSourceType;
  mountPath: string;
  createdAt: string;
  updatedAt?: string;
};

export type PendingChatFile = {
  id: string;
  file: File;
  name: string;
  relativePath?: string;
  mimeType: string;
  size: number;
  sourceType: Extract<ChatFileSourceType, "text" | "pdf" | "table" | "image">;
};
