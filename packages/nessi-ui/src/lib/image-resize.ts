import type { UIUserContentPart } from "./chat-content.js";

const MAX_IMAGE_DIMENSION = 1600;

const readFileAsDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}.`));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image."));
    image.src = src;
  });

const outputMediaType = (inputType: string) => {
  if (inputType === "image/png" || inputType === "image/webp" || inputType === "image/jpeg") {
    return inputType;
  }
  return "image/jpeg";
};

const resizedDimensions = (width: number, height: number) => {
  const longest = Math.max(width, height);
  if (longest <= MAX_IMAGE_DIMENSION) return { width, height };
  const scale = MAX_IMAGE_DIMENSION / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
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

  const originalSrc = await readFileAsDataURL(file);
  const image = await loadImage(originalSrc);
  const { width, height } = resizedDimensions(image.naturalWidth, image.naturalHeight);

  let src = originalSrc;
  let mediaType = file.type;

  if (width !== image.naturalWidth || height !== image.naturalHeight) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create image canvas.");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, width, height);

    mediaType = outputMediaType(file.type);
    src = canvas.toDataURL(mediaType, mediaType === "image/png" ? undefined : 0.88);
  }

  const [, data = ""] = src.split(",", 2);
  return {
    type: "image",
    src,
    data,
    mediaType,
    name: file.name,
  };
};
