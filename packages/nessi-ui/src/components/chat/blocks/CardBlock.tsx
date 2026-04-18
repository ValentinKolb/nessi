import { Show, For } from "solid-js";
import sanitizeHtml from "sanitize-html";
import type { UICardBlock } from "../types.js";

/* ------------------------------------------------------------------ */
/*  Sanitizer for custom HTML content                                 */
/* ------------------------------------------------------------------ */

const ALLOWED_TAGS = ["header", "metric", "row", "label", "value", "badge", "divider", "footer", "i", "table", "tr", "td", "th", "thead", "tbody", "span", "em", "strong", "br", "hr", "small", "p", "div", "ul", "li"];

const sanitizeCardHtml = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { "*": ["class", "style"] },
    allowedStyles: { "*": { "color": [/.*/], "font-weight": [/.*/], "text-align": [/.*/], "margin": [/.*/], "padding": [/.*/] } },
  });

/* ------------------------------------------------------------------ */
/*  Data normalization — handle whatever shape the agent sends        */
/* ------------------------------------------------------------------ */

/** Safely get an array, parsing JSON strings if needed. */
const asArray = (val: unknown): unknown[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch { /* ignore */ }
  }
  return [];
};

const asString = (val: unknown): string => (val == null ? "" : String(val));

/* ------------------------------------------------------------------ */
/*  Layout types                                                      */
/* ------------------------------------------------------------------ */

type D = Record<string, unknown>;

/* ------------------------------------------------------------------ */
/*  Shared                                                            */
/* ------------------------------------------------------------------ */

const Icon = (props: { name?: string }) => (
  <Show when={props.name}>
    <span class={`i ti ${props.name}`} />
  </Show>
);

const CardHeader = (props: { icon?: string; title?: string }) => (
  <Show when={props.title}>
    <div class="ai-card-header">
      <Icon name={asString(props.icon)} />
      <span>{asString(props.title)}</span>
    </div>
  </Show>
);

const CardFooter = (props: { text?: string }) => (
  <Show when={props.text}>
    <div class="ai-card-footer">{asString(props.text)}</div>
  </Show>
);

/* ------------------------------------------------------------------ */
/*  Layouts                                                           */
/* ------------------------------------------------------------------ */

const MetricLayout = (props: { d: D }) => (
  <div class="ai-card">
    <CardHeader icon={asString(props.d.icon)} title={asString(props.d.title)} />
    <div class="ai-card-metric">{asString(props.d.value)}</div>
    <Show when={props.d.subtitle}>
      <div class="ai-card-subtitle">{asString(props.d.subtitle)}</div>
    </Show>
    <CardFooter text={asString(props.d.footer)} />
  </div>
);

const RowsLayout = (props: { d: D }) => {
  const rows = () => asArray(props.d.rows).map((r) => {
    if (typeof r === "object" && r !== null) {
      const o = r as Record<string, unknown>;
      return { label: asString(o.label), value: asString(o.value), class: asString(o.class) };
    }
    return { label: String(r), value: "", class: "" };
  });

  return (
    <div class="ai-card">
      <CardHeader icon={asString(props.d.icon)} title={asString(props.d.title)} />
      <div class="ai-card-rows">
        <For each={rows()}>
          {(row, i) => (
            <div class={`ai-card-row ${i() % 2 === 1 ? "ai-card-row-alt" : ""}`}>
              <span class="ai-card-label">{row.label}</span>
              <span class={`ai-card-value ${row.class}`}>{row.value}</span>
            </div>
          )}
        </For>
      </div>
      <CardFooter text={asString(props.d.footer)} />
    </div>
  );
};

const CompareLayout = (props: { d: D }) => {
  const items = () => asArray(props.d.items).map((item) => {
    if (typeof item === "object" && item !== null) {
      const o = item as Record<string, unknown>;
      return { icon: asString(o.icon), label: asString(o.label), value: asString(o.value) };
    }
    return { icon: "", label: String(item), value: "" };
  });

  return (
    <div class="ai-card">
      <CardHeader title={asString(props.d.title)} />
      <For each={items()}>
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
};

const ChecklistLayout = (props: { d: D }) => {
  const items = () => asArray(props.d.items).map((item) => {
    if (typeof item === "object" && item !== null) {
      const o = item as Record<string, unknown>;
      return { text: asString(o.text || o.label || o.name), done: Boolean(o.done || o.checked || o.completed) };
    }
    return { text: String(item), done: false };
  });

  return (
    <div class="ai-card">
      <CardHeader title={asString(props.d.title)} />
      <div class="ai-card-checklist">
        <For each={items()}>
          {(item) => (
            <div class="ai-card-check-item">
              <span class={`i ti ${item.done ? "ti-circle-check" : "ti-circle"} ${item.done ? "ok" : "muted"}`} />
              <span class={item.done ? "ai-card-done" : ""}>{item.text}</span>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};

const TableLayout = (props: { d: D }) => {
  const columns = () => asArray(props.d.columns).map(String);
  const rows = () => asArray(props.d.rows).map((r) => asArray(r).map(String));

  return (
    <div class="ai-card">
      <CardHeader title={asString(props.d.title)} />
      <div class="ai-card-table-wrap">
        <table class="ai-card-table">
          <Show when={columns().length > 0}>
            <thead>
              <tr>
                <For each={columns()}>{(col) => <th>{col}</th>}</For>
              </tr>
            </thead>
          </Show>
          <tbody>
            <For each={rows()}>
              {(row) => (
                <tr>
                  <For each={row}>{(cell) => <td>{cell}</td>}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

const layoutMap: Record<string, (d: D) => ReturnType<typeof MetricLayout>> = {
  metric: (d) => <MetricLayout d={d} />,
  rows: (d) => <RowsLayout d={d} />,
  compare: (d) => <CompareLayout d={d} />,
  checklist: (d) => <ChecklistLayout d={d} />,
  table: (d) => <TableLayout d={d} />,
};

export const CardBlock = (props: { block: UICardBlock }) => {
  if (props.block.layout && props.block.data && layoutMap[props.block.layout]) {
    return layoutMap[props.block.layout]!(props.block.data);
  }

  if (props.block.content) {
    return <div class="ai-card ai-card-html" innerHTML={sanitizeCardHtml(props.block.content)} />;
  }

  return null;
};
