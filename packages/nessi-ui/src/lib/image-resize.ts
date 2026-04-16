import { images } from "@valentinkolb/stdlib/browser";
import type { UIUserContentPart } from "./chat-content.js";

const MAX_IMAGE_DIMENSION = 1600;

const outputMediaType = (inputType: string) => {
  if (inputType === "image/png" || inputType === "image/webp" || inputType === "image/jpeg") {
    return inputType;
  }
  return "image/jpeg";
};

/**
 * Resize large image uploads in-browser before they enter chat state or provider payloads.
 * This keeps previews and multimodal requests within a predictable size range.
 */
export const prepareImageUpload = async (
  file: File,
): Promise<Extract<UIUserContentPart, { type: "image" }>> => {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }

  const img = await images.create(file);
  const longest = Math.max(img.width, img.height);
  const needsResize = longest > MAX_IMAGE_DIMENSION;
  const mediaType = outputMediaType(file.type) as "jpeg" | "webp" | "png";
  const quality = mediaType === "png" ? undefined : 0.88;

  let src: string;
  if (needsResize) {
    const scale = MAX_IMAGE_DIMENSION / longest;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    src = await images.create(file)
      .then(images.resize(w, h))
      .then(images.toBase64(mediaType, quality));
  } else {
    src = await images.toBase64(mediaType, quality)(Promise.resolve(img));
  }

  const [, data = ""] = src.split(",", 2);
  return {
    type: "image",
    src,
    data,
    mediaType: outputMediaType(file.type),
    name: file.name,
  };
};
