import { z } from "zod";
import { defineTool } from "nessi-core";

export const cardToolDef = defineTool({
  name: "card",
  description:
    "Display a formatted info card in the chat. Use for structured results like prices, stats, status overviews, or comparisons.\n" +
    "Two modes: (1) Prebuilt layout — set layout + data. (2) Custom HTML — set content with semantic elements.\n" +
    "Layouts: metric (big number), rows (key-value list), compare (side-by-side values), checklist (tasks), table (mini table).\n" +
    'Example metric: {"layout":"metric","data":{"icon":"ti-coin","title":"Gold","value":"4,831 €/oz","subtitle":"per troy ounce","footer":"Updated 2s ago"}}\n' +
    'Example rows: {"layout":"rows","data":{"title":"Details","rows":[{"label":"Weight","value":"23g"},{"label":"Purity","value":"750 (18K)"},{"label":"Value","value":"1,650 €","class":"ok"}]}}',
  inputSchema: z.object({
    layout: z.enum(["metric", "rows", "compare", "checklist", "table"]).optional()
      .describe("Prebuilt layout type. Omit when using custom content HTML."),
    data: z.record(z.string(), z.unknown()).optional()
      .describe("Data for the prebuilt layout. Shape depends on layout type."),
    content: z.string().optional()
      .describe("Custom HTML using allowed elements: header, metric, row, label, value, badge, divider, footer, i, table. Only used when layout is not set."),
  }),
  outputSchema: z.object({
    displayed: z.boolean(),
  }),
  needsApproval: false,
});

export const cardTool = cardToolDef.client(() => ({ displayed: true }));
