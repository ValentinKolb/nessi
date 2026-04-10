import { generate } from "lean-qr";
import { toSvgSource } from "lean-qr/extras/svg";

export type QrOptions = {
  scale?: number;
  on?: string;
  off?: string;
};

/** Generate a QR code as an SVG string. */
export const generateQrSvg = (data: string, options?: QrOptions) => {
  const code = generate(data);
  return toSvgSource(code, {
    on: options?.on ?? "#000",
    off: options?.off ?? "#fff",
    scale: options?.scale ?? 8,
    xmlDeclaration: false,
  });
};
