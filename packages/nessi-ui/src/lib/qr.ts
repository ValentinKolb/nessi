import { qr } from "@valentinkolb/stdlib";

export type QrOptions = { on?: string; off?: string };

/** Generate a QR code as an SVG string. */
export const generateQrSvg = (data: string, options?: QrOptions) =>
  qr.toSvg(data, { on: options?.on, off: options?.off });
