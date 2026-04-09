import type { ContentPart } from "nessi-core";

export type UIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; src: string; mediaType: string; data: string; name?: string }
  | { type: "file"; fileId: string; name: string; mimeType: string; size: number };

export const filePartSrc = (mediaType: string, data: string) =>
  `data:${mediaType};base64,${data}`;

export const contentPartsToUIContent = (parts: ContentPart[]): UIUserContentPart[] =>
  parts.map((part) => {
    if (typeof part === "string") return { type: "text" as const, text: part };
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return {
      type: "image" as const,
      src: filePartSrc(part.mediaType, part.data),
      mediaType: part.mediaType,
      data: part.data,
    };
  });

export const uiContentToParts = (content: UIUserContentPart[]) =>
  content.flatMap((part): ContentPart[] => {
    if (part.type === "text") return [{ type: "text", text: part.text }];
    if (part.type === "image") return [{ type: "file", data: part.data, mediaType: part.mediaType }];
    return [];
  });

export const uiContentText = (content: UIUserContentPart[]) =>
  content
    .filter((part): part is Extract<UIUserContentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
