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
/*  Data normalization                                                */
/* ------------------------------------------------------------------ */

const asArray = (val: unknown): unknown[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { const p = JSON.parse(val); if (Array.isArray(p)) return p; } catch { /* ignore */ }
  }
  return [];
};

const asString = (val: unknown): string => (val == null ? "" : String(val));

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
/*  Metric layout — single or multi-grid                              */
/* ------------------------------------------------------------------ */

const MetricItem = (props: { icon?: string; title?: string; value: string; subtitle?: string }) => (
  <div class="ai-card-metric-item">
    <div class="ai-card-metric-label">
      <Icon name={props.icon} />
      <Show when={props.title}><span>{props.title}</span></Show>
    </div>
    <div class="ai-card-metric-value">{props.value}</div>
    <Show when={props.subtitle}>
      <div class="ai-card-subtitle">{props.subtitle}</div>
    </Show>
  </div>
);

const MetricLayout = (props: { d: D }) => {
  const items = () => {
    const raw = props.d.items;
    if (raw) {
      return asArray(raw).map((item) => {
        if (typeof item === "object" && item !== null) {
          const o = item as D;
          return { icon: asString(o.icon), title: asString(o.title), value: asString(o.value), subtitle: asString(o.subtitle) };
        }
        return { icon: "", title: "", value: String(item), subtitle: "" };
      });
    }
    return [{ icon: asString(props.d.icon), title: asString(props.d.title), value: asString(props.d.value), subtitle: asString(props.d.subtitle) }];
  };

  const isSingle = () => items().length === 1;

  return (
    <div class="ai-card">
      <Show when={isSingle()}>
        <CardHeader icon={asString(props.d.icon)} title={asString(props.d.title)} />
        <div class="ai-card-metric-value ai-card-metric-value-hero">{items()[0]!.value}</div>
        <Show when={items()[0]!.subtitle}>
          <div class="ai-card-subtitle">{items()[0]!.subtitle}</div>
        </Show>
      </Show>
      <Show when={!isSingle()}>
        <CardHeader icon={asString(props.d.icon)} title={asString(props.d.title)} />
        <div class="ai-card-metric-grid">
          <For each={items()}>
            {(item) => <MetricItem icon={item.icon} title={item.title} value={item.value} subtitle={item.subtitle} />}
          </For>
        </div>
      </Show>
      <CardFooter text={asString(props.d.footer)} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Checklist layout                                                  */
/* ------------------------------------------------------------------ */

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
      <CardHeader icon={asString(props.d.icon)} title={asString(props.d.title)} />
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

/* ------------------------------------------------------------------ */
/*  Table layout                                                      */
/* ------------------------------------------------------------------ */

const TableLayout = (props: { d: D }) => {
  const columns = () => asArray(props.d.columns).map(String);
  const rows = () => asArray(props.d.rows).map((r) => asArray(r).map(String));

  return (
    <div class="ai-card">
      <CardHeader icon={asString(props.d.icon)} title={asString(props.d.title)} />
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
      <CardFooter text={asString(props.d.footer)} />
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Main component                                                    */
/* ------------------------------------------------------------------ */

const layoutMap: Record<string, (d: D) => ReturnType<typeof MetricLayout>> = {
  metric: (d) => <MetricLayout d={d} />,
  compare: (d) => <MetricLayout d={d} />,  // backwards compat
  rows: (d) => <TableLayout d={d} />,      // backwards compat
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
