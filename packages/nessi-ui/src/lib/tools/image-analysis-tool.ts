import { z } from "zod";
import { defineTool } from "nessi-core";
import type { Tool, Provider } from "nessi-core";
import type { ContentPart } from "nessi-ai";
import type { ChatFileService } from "../file-service.js";

import imageAnalysisPromptContent from "../../assets/prompts/image-analysis-prompt.mustache?raw";
import { settingsRepo } from "../../domains/settings/index.js";
import { createProvider, getActiveProviderEntry, loadProviders } from "../provider.js";

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------

export const getImageAnalysisPrompt = async () =>
  await settingsRepo.getImageAnalysisPrompt() ?? imageAnalysisPromptContent;

export const setImageAnalysisPrompt = async (prompt: string) =>
  settingsRepo.setImageAnalysisPrompt(prompt);

export const resetImageAnalysisPrompt = async () => {
  await settingsRepo.setImageAnalysisPrompt(imageAnalysisPromptContent);
  return imageAnalysisPromptContent;
};

export const getDefaultImageAnalysisPrompt = () => imageAnalysisPromptContent;

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const analyzeImageToolDef = defineTool({
  name: "analyze_image",
  description:
    "Analyze images using vision AI. For image manipulation (resize, crop, convert) use bash instead.\n" +
    '{"path":"/input/photo.jpg","question":"What text is visible?"}\n' +
    'Multiple: {"path":["/input/a.jpg","/input/b.jpg"],"question":"Compare these."}',
  inputSchema: z.object({
    path: z.union([z.string(), z.array(z.string())]).describe("Image path(s). String or array (max 5)."),
    question: z.string().describe("What to analyze. Be specific."),
  }),
  outputSchema: z.object({
    analysis: z.string(),
  }),
  needsApproval: false,
});

// ---------------------------------------------------------------------------
// Resolve which provider to use for image analysis
// ---------------------------------------------------------------------------

const resolveProvider = async (chatProvider: Provider | null): Promise<Provider> => {
  const settings = await settingsRepo.getImageAnalysisSettings();

  // Use a specific provider if configured
  if (settings.providerId) {
    const providers = loadProviders();
    const entry = providers.find((p) => p.id === settings.providerId);
    if (entry) return createProvider(entry);
  }

  // Default: use the active chat provider
  if (chatProvider) return chatProvider;

  // Fallback: use whatever is active globally
  const active = getActiveProviderEntry();
  if (active) return createProvider(active);

  throw new Error("No provider configured for image analysis. Add a provider in Settings.");
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createImageAnalysisTool = (
  fileService: ChatFileService,
  chatProvider: Provider | null,
): Tool =>
  analyzeImageToolDef.server(async (input) => {
    // Coerce single string to array at runtime
    const paths = Array.isArray(input.path) ? input.path.slice(0, 5) : [input.path];

    // Read all images
    const imageParts: ContentPart[] = [];
    for (const p of paths) {
      try {
        const { mimeType, bytes } = await fileService.readBytes(p);
        if (!mimeType.startsWith("image/")) {
          return { analysis: `Error: ${p} is not an image file (${mimeType}).` };
        }
        // Convert Uint8Array to base64
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        const base64 = btoa(binary);
        imageParts.push({ type: "file", data: base64, mediaType: mimeType });
      } catch (err) {
        return { analysis: `Error reading ${p}: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    // Resolve provider and system prompt
    const provider = await resolveProvider(chatProvider);
    const systemPrompt = await getImageAnalysisPrompt();

    // Build message: question text + image(s)
    const content: ContentPart[] = [
      { type: "text", text: input.question },
      ...imageParts,
    ];

    try {
      const result = await provider.complete({
        systemPrompt,
        messages: [{ role: "user", content }],
        maxOutputTokens: 2000,
      });

      const text = result.message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join(" ")
        .trim();

      return { analysis: text || "No analysis produced." };
    } catch (err) {
      return { analysis: `Error during image analysis: ${err instanceof Error ? err.message : String(err)}` };
    }
  });
