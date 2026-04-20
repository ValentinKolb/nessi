import { z } from "zod";
import { defineTool } from "nessi-core";

export const cardToolDef = defineTool({
  name: "card",
  description:
    "Display a formatted info card. Use for numbers, stats, comparisons, checklists, or small tables.\n" +
    "Layouts: metric (big numbers, also for comparisons — supports items array for multi), checklist (done/pending tasks), table (up to ~20 rows).\n" +
    "Icons: Tabler Icons with ti- prefix (ti-coin, ti-chart-line, ti-trending-up, ti-clock, ti-user, ti-server, ti-database, ti-cpu, ti-calendar, ti-bolt, ti-home, ti-building, ti-star, ti-alert-triangle, ti-shopping-cart).\n" +
    'metric: {"layout":"metric","data":{"icon":"ti-trending-up","title":"Revenue","value":"$128k","subtitle":"this month","footer":"Updated just now"}}\n' +
    'metric (multi): {"layout":"metric","data":{"icon":"ti-server","title":"Status","items":[{"icon":"ti-cpu","title":"CPU","value":"23%","subtitle":"4 cores"},{"icon":"ti-database","title":"RAM","value":"4.2 GB","subtitle":"of 8 GB"}]}}\n' +
    'checklist: {"layout":"checklist","data":{"icon":"ti-list-check","title":"Tasks","items":[{"text":"Step 1","done":true},{"text":"Step 2","done":false}]}}\n' +
    'table: {"layout":"table","data":{"icon":"ti-users","title":"Team","columns":["Name","Role"],"rows":[["Alice","Eng"],["Bob","Design"]]}}',
  inputSchema: z.object({
    layout: z.enum(["metric", "checklist", "table"]).optional()
      .describe("Layout type. Omit when using custom content HTML."),
    data: z.record(z.string(), z.unknown()).optional()
      .describe("Data object. Shape depends on layout."),
    content: z.string().optional()
      .describe("Custom HTML with semantic elements. Only when layout is not set."),
  }),
  outputSchema: z.object({
    displayed: z.boolean(),
  }),
  needsApproval: false,
});

export const cardTool = cardToolDef.client(() => ({ displayed: true }));
