import { z } from "zod";
import { defineTool } from "nessi-core";
import type { Tool } from "nessi-core";
import type { ChatFileService } from "../file-service.js";
import { getTablePreview } from "../table-ops.js";

const MAX_TEXT_LENGTH = 15_000;
const MAX_TABLE_ROWS = 200;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const presentToolDef = defineTool({
  name: "present",
  description:
    "Display a file inline in the chat. Use this after creating or receiving a file to show it to the user and give them a direct download button. " +
    "Supports SVG, images, CSV/XLSX tables, and text files. Example: {\"path\":\"/output/chart.svg\"}.",
  inputSchema: z.object({
    path: z.string().describe("Absolute file path to present, e.g. '/output/chart.svg' or '/input/data.csv'."),
  }),
  outputSchema: z.object({
    status: z.string(),
    path: z.string(),
    name: z.string(),
  }),
});

type ContentType = "svg" | "image" | "table" | "text" | "download";

const inferContentType = (mimeType: string, name: string): ContentType => {
  if (mimeType === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  if (mimeType.startsWith("image/")) return "image";
  if (/\.(csv|tsv|xlsx|xls)$/i.test(name)) return "table";
  if (mimeType.startsWith("text/") || /\.(json|md|yaml|yml|toml|xml|html|css|js|jsx|ts|tsx|py|rs|go|sql|sh|txt)$/i.test(name)) return "text";
  return "download";
};

const arrayBufferToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
};

export const createPresentTool = (fileService: ChatFileService): Tool =>
  presentToolDef.server(async (input): Promise<{ status: string; path: string; name: string }> => {
    const { mimeType, bytes } = await fileService.readBytes(input.path);
    const name = input.path.split("/").pop() ?? "file";
    const contentType = inferContentType(mimeType, name);

    const base: Record<string, unknown> = {
      status: "ok",
      path: input.path,
      name,
      contentType,
    };

    switch (contentType) {
      case "svg": {
        base.content = new TextDecoder().decode(bytes);
        break;
      }
      case "image": {
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
          base.contentType = "download";
          break;
        }
        base.content = `data:${mimeType};base64,${arrayBufferToBase64(bytes)}`;
        break;
      }
      case "table": {
        const preview = await getTablePreview(bytes, name, { rows: MAX_TABLE_ROWS });
        base.tableData = {
          headers: preview.columns,
          rows: preview.rows.map((row) => preview.columns.map((col) => row[col] ?? "")),
          totalRows: preview.rows.length,
        };
        break;
      }
      case "text": {
        let text = new TextDecoder().decode(bytes);
        if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH) + "\n… (truncated)";
        base.content = text;
        break;
      }
    }

    return base as { status: string; path: string; name: string };
  });
