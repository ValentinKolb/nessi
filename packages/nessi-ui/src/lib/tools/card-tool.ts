import { z } from "zod";
import { defineTool } from "nessi-core";

export const cardToolDef = defineTool({
  name: "card",
  description:
    "Display a formatted info card in the chat. Use for structured results like prices, stats, status overviews, or checklists.\n" +
    "Set layout + data for prebuilt layouts, or set content for custom HTML.\n" +
    "Layouts: metric (one or multiple big numbers in a grid — also use for comparisons), checklist (tasks with done/pending), table (data table up to ~20 rows).\n" +
    "Icons are Tabler Icons (prefix ti-). Common: ti-coin, ti-chart-line, ti-chart-bar, ti-trending-up, ti-trending-down, ti-currency-euro, ti-currency-dollar, ti-clock, ti-calendar, ti-user, ti-users, ti-server, ti-database, ti-cpu, ti-world, ti-mail, ti-phone, ti-map-pin, ti-star, ti-heart, ti-check, ti-alert-triangle, ti-info-circle, ti-shopping-cart, ti-home, ti-building, ti-bolt, ti-flame, ti-snowflake, ti-sun.\n" +
    "Examples:\n" +
    'metric (single): {"layout":"metric","data":{"icon":"ti-trending-up","title":"Revenue","value":"$128,450","subtitle":"this month","footer":"Updated just now"}}\n' +
    'metric (multi): {"layout":"metric","data":{"icon":"ti-server","title":"System Health","items":[{"icon":"ti-cpu","title":"CPU","value":"23%","subtitle":"4 cores"},{"icon":"ti-database","title":"Memory","value":"4.2 GB","subtitle":"of 8 GB"},{"icon":"ti-bolt","title":"Latency","value":"12ms","subtitle":"avg response"},{"icon":"ti-clock","title":"Uptime","value":"42d","subtitle":"since last restart"}],"footer":"Last checked: 5s ago"}}\n' +
    'checklist: {"layout":"checklist","data":{"icon":"ti-list-check","title":"Launch Checklist","items":[{"text":"Database migrated","done":true},{"text":"Tests passing","done":true},{"text":"Deploy to production","done":false}]}}\n' +
    'table: {"layout":"table","data":{"icon":"ti-users","title":"Team Overview","columns":["Name","Role","Status"],"rows":[["Alice","Engineering","active"],["Bob","Design","on leave"],["Carol","Product","active"]]}}',
  inputSchema: z.object({
    layout: z.enum(["metric", "checklist", "table"]).optional()
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
