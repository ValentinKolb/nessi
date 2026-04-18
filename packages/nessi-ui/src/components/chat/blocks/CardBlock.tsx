import { Show, For } from "solid-js";
import sanitizeHtml from "sanitize-html";
import type { UICardBlock } from "../types.js";

/* ------------------------------------------------------------------ */
/*  Sanitizer for custom HTML content                                 */
/* ------------------------------------------------------------------ */

const sanitizeCardHtml = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: ["header", "metric", "row", "label", "value", "badge", "divider", "footer", "i", "table", "tr", "td", "th", "thead", "tbody", "span", "em", "strong", "br"],
    allowedAttributes: {
      i: ["class"],
      badge: ["class"],
      value: ["class"],
      span: ["class"],
      row: ["class"],
    },
    allowedClasses: {
      "*": ["ok", "err", "warn", "muted", "large", "small", "ti-*"],
    },
  });

/* ------------------------------------------------------------------ */
/*  Layout renderers                                                  */
/* ------------------------------------------------------------------ */

type MetricData = { icon?: string; title?: string; value?: string; subtitle?: string; footer?: string };
type RowsData = { icon?: string; title?: string; rows?: Array<{ label: string; value: string; class?: string }>; footer?: string };
type CompareData = { title?: string; items?: Array<{ icon?: string; label: string; value: string }> };
type ChecklistData = { title?: string; items?: Array<{ text: string; done?: boolean }> };
type TableData = { title?: string; columns?: string[]; rows?: string[][] };

const Icon = (props: { name?: string }) => (
  <Show when={props.name}>
    <span class={`i ti ${props.name} text-base`} />
  </Show>
);

const MetricLayout = (props: { data: MetricData }) => (
  <div class="ai-card">
    <Show when={props.data.title}>
      <div class="ai-card-header">
        <Icon name={props.data.icon} />
        <span>{props.data.title}</span>
      </div>
    </Show>
    <div class="ai-card-metric">{props.data.value}</div>
    <Show when={props.data.subtitle}>
      <div class="ai-card-subtitle">{props.data.subtitle}</div>
    </Show>
    <Show when={props.data.footer}>
      <div class="ai-card-footer">{props.data.footer}</div>
    </Show>
  </div>
);

const RowsLayout = (props: { data: RowsData }) => (
  <div class="ai-card">
    <Show when={props.data.title}>
      <div class="ai-card-header">
        <Icon name={props.data.icon} />
        <span>{props.data.title}</span>
      </div>
    </Show>
    <div class="ai-card-rows">
      <For each={props.data.rows ?? []}>
        {(row) => (
          <div class="ai-card-row">
            <span class="ai-card-label">{row.label}</span>
            <span class={`ai-card-value ${row.class ?? ""}`}>{row.value}</span>
          </div>
        )}
      </For>
    </div>
    <Show when={props.data.footer}>
      <div class="ai-card-footer">{props.data.footer}</div>
    </Show>
  </div>
);

const CompareLayout = (props: { data: CompareData }) => (
  <div class="ai-card">
    <Show when={props.data.title}>
      <div class="ai-card-header"><span>{props.data.title}</span></div>
    </Show>
    <For each={props.data.items ?? []}>
      {(item, i) => (
        <>
          <Show when={i() > 0}><div class="ai-card-divider" /></Show>
          <div class="ai-card-compare-item">
            <div class="ai-card-compare-label">
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </div>
            <div class="ai-card-compare-value">{item.value}</div>
          </div>
        </>
      )}
    </For>
  </div>
);

const ChecklistLayout = (props: { data: ChecklistData }) => {
  const items = () => (props.data.items ?? []).map((item) =>
    typeof item === "string" ? { text: item, done: false } : item,
  );
  return (
    <div class="ai-card">
      <Show when={props.data.title}>
        <div class="ai-card-header"><span>{props.data.title}</span></div>
      </Show>
      <div class="ai-card-checklist">
        <For each={items()}>
          {(item) => (
            <div class="ai-card-check-item">
              <span class={`i ti ${item.done ? "ti-circle-check" : "ti-circle"} ${item.done ? "ok" : "muted"}`} />
              <span class={item.done ? "ai-card-done" : ""}>{String(item.text ?? "")}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

const TableLayout = (props: { data: TableData }) => (
  <div class="ai-card">
    <Show when={props.data.title}>
      <div class="ai-card-header"><span>{props.data.title}</span></div>
    </Show>
    <table class="ai-card-table">
      <Show when={(props.data.columns ?? []).length > 0}>
        <thead>
          <tr>
            <For each={props.data.columns ?? []}>{(col) => <th>{col}</th>}</For>
          </tr>
        </thead>
      </Show>
      <tbody>
        <For each={props.data.rows ?? []}>
          {(row) => (
            <tr>
              <For each={row}>{(cell) => <td>{cell}</td>}</For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </div>
);

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

/** Safely extract an array from a field that might be a JSON string or already an array. */
const toArray = (val: unknown): unknown[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch { /* ignore */ }
  return [];
};

const normalizeData = (d: Record<string, unknown>): Record<string, unknown> => ({
  ...d,
  items: d.items ? toArray(d.items) : undefined,
  rows: d.rows ? toArray(d.rows) : undefined,
  columns: d.columns ? toArray(d.columns) : undefined,
});

const layouts: Record<string, (data: Record<string, unknown>) => ReturnType<typeof MetricLayout>> = {
  metric: (d) => <MetricLayout data={d as unknown as MetricData} />,
  rows: (d) => <RowsLayout data={normalizeData(d) as unknown as RowsData} />,
  compare: (d) => <CompareLayout data={normalizeData(d) as unknown as CompareData} />,
  checklist: (d) => <ChecklistLayout data={normalizeData(d) as unknown as ChecklistData} />,
  table: (d) => <TableLayout data={normalizeData(d) as unknown as TableData} />,
};

export const CardBlock = (props: { block: UICardBlock }) => {
  // Prebuilt layout mode
  if (props.block.layout && props.block.data && layouts[props.block.layout]) {
    return layouts[props.block.layout]!(props.block.data);
  }

  // Custom HTML mode
  if (props.block.content) {
    return <div class="ai-card" innerHTML={sanitizeCardHtml(props.block.content)} />;
  }

  return null;
};
