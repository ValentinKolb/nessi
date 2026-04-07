import type { ContentPart } from "nessi-core";

export type UIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; src: string; mediaType: string; data: string; name?: string };

export function filePartSrc(mediaType: string, data: string): string {
  return `data:${mediaType};base64,${data}`;
}

export function contentPartsToUIContent(parts: ContentPart[]): UIUserContentPart[] {
  return parts.map((part) => {
    if (typeof part === "string") return { type: "text" as const, text: part };
    if (part.type === "text") return { type: "text" as const, text: part.text };
    return {
      type: "image" as const,
      src: filePartSrc(part.mediaType, part.data),
      mediaType: part.mediaType,
      data: part.data,
    };
  });
}

export function uiContentToParts(content: UIUserContentPart[]): ContentPart[] {
  return content.map((part) =>
    part.type === "text"
      ? ({ type: "text", text: part.text } as const)
      : ({ type: "file", data: part.data, mediaType: part.mediaType } as const),
  );
}

export function uiContentText(content: UIUserContentPart[]): string {
  return content
    .filter((part): part is Extract<UIUserContentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .trim();
}
