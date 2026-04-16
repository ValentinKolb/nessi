/**
 * Lightweight SVG chart generation matching the nessi design system.
 * No external dependencies – pure string-based SVG output.
 */

const COLORS = ["#8664e0", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

/*
 * Theme-aware chart colors using CSS custom properties.
 * Works because charts are rendered as inline SVG (innerHTML),
 * so the browser resolves var() from the document cascade.
 * Fallback values ensure standalone SVGs still render.
 */
const AXIS_COLOR = "var(--color-gh-subtle, #d4d4d8)";
const LABEL_COLOR = "var(--color-gh-fg-muted, #52525b)";
const TITLE_COLOR = "var(--color-gh-fg, #18181b)";
const BG_COLOR = "var(--color-gh-surface, #ffffff)";
const FONT = "ui-monospace, 'SF Mono', 'Cascadia Code', Menlo, Consolas, monospace";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const niceMax = (max: number) => {
  if (max <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  const normalized = max / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
};

const tickValues = (max: number, count = 5) => {
  const step = max / count;
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
};

const formatNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K`
      : n % 1 === 0 ? String(n)
        : n.toFixed(1);

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

export type BarChartData = {
  labels: string[];
  values: number[];
  title?: string;
};

export const barChart = (data: BarChartData) => {
  const W = 600, H = 380;
  const pad = { top: 44, right: 20, bottom: 56, left: 56 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const n = data.labels.length;
  if (n === 0) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${LABEL_COLOR}" font-family="${FONT}" font-size="12">No data</text></svg>`;

  const maxVal = niceMax(Math.max(...data.values, 0));
  const barW = Math.min(48, (chartW / n) * 0.6);
  const gap = (chartW - barW * n) / (n + 1);
  const ticks = tickValues(maxVal);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`,
    `<rect width="${W}" height="${H}" rx="8" fill="${BG_COLOR}"/>`,
  ];

  if (data.title) {
    lines.push(`<text x="${W / 2}" y="28" text-anchor="middle" font-size="13" font-weight="600" fill="${TITLE_COLOR}">${esc(data.title)}</text>`);
  }

  // grid + y-axis labels
  for (const tick of ticks) {
    const y = pad.top + chartH - (tick / maxVal) * chartH;
    lines.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${AXIS_COLOR}" stroke-dasharray="${tick === 0 ? "" : "3,3"}"/>`);
    lines.push(`<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="${LABEL_COLOR}">${formatNum(tick)}</text>`);
  }

  // bars + x-axis labels
  for (let i = 0; i < n; i++) {
    const x = pad.left + gap + i * (barW + gap);
    const val = data.values[i] ?? 0;
    const barH = maxVal > 0 ? (val / maxVal) * chartH : 0;
    const y = pad.top + chartH - barH;
    const color = COLORS[i % COLORS.length];

    lines.push(`<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="3" fill="${color}" opacity="0.85"/>`);
    lines.push(`<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="10" font-weight="500" fill="${TITLE_COLOR}">${formatNum(val)}</text>`);

    const label = data.labels[i] ?? "";
    const truncLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;
    lines.push(`<text x="${x + barW / 2}" y="${pad.top + chartH + 18}" text-anchor="middle" font-size="10" fill="${LABEL_COLOR}">${esc(truncLabel)}</text>`);
  }

  lines.push("</svg>");
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Line chart
// ---------------------------------------------------------------------------

export type LineChartData = {
  labels: string[];
  series: Record<string, number[]>;
  title?: string;
};

export const lineChart = (data: LineChartData) => {
  const W = 600, H = 380;
  const pad = { top: 44, right: 20, bottom: 72, left: 56 };
  const chartW = W - pad.left - pad.right;
  const chartH = H - pad.top - pad.bottom;
  const n = data.labels.length;
  const seriesEntries = Object.entries(data.series);
  if (n === 0 || seriesEntries.length === 0) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${LABEL_COLOR}" font-family="${FONT}" font-size="12">No data</text></svg>`;

  const allValues = seriesEntries.flatMap(([, vals]) => vals);
  const maxVal = niceMax(Math.max(...allValues, 0));
  const ticks = tickValues(maxVal);
  const stepX = chartW / Math.max(n - 1, 1);

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`,
    `<rect width="${W}" height="${H}" rx="8" fill="${BG_COLOR}"/>`,
  ];

  if (data.title) {
    lines.push(`<text x="${W / 2}" y="28" text-anchor="middle" font-size="13" font-weight="600" fill="${TITLE_COLOR}">${esc(data.title)}</text>`);
  }

  // grid + y-axis labels
  for (const tick of ticks) {
    const y = pad.top + chartH - (tick / maxVal) * chartH;
    lines.push(`<line x1="${pad.left}" y1="${y}" x2="${W - pad.right}" y2="${y}" stroke="${AXIS_COLOR}" stroke-dasharray="${tick === 0 ? "" : "3,3"}"/>`);
    lines.push(`<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="${LABEL_COLOR}">${formatNum(tick)}</text>`);
  }

  // x-axis labels
  const labelStep = Math.max(1, Math.ceil(n / 12));
  for (let i = 0; i < n; i += labelStep) {
    const x = pad.left + i * stepX;
    const label = data.labels[i] ?? "";
    const truncLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;
    lines.push(`<text x="${x}" y="${pad.top + chartH + 18}" text-anchor="middle" font-size="10" fill="${LABEL_COLOR}">${esc(truncLabel)}</text>`);
  }

  // series lines + dots
  for (let s = 0; s < seriesEntries.length; s++) {
    const [name, vals] = seriesEntries[s]!;
    const color = COLORS[s % COLORS.length];
    const points = vals.map((v, i) => {
      const x = pad.left + i * stepX;
      const y = pad.top + chartH - (v / maxVal) * chartH;
      return { x, y };
    });

    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    lines.push(`<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);

    for (const p of points) {
      lines.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.5" fill="${BG_COLOR}" stroke="${color}" stroke-width="2"/>`);
    }

    // legend
    const ly = pad.top + chartH + 38 + s * 16;
    lines.push(`<rect x="${pad.left}" y="${ly - 8}" width="12" height="12" rx="2" fill="${color}" opacity="0.85"/>`);
    lines.push(`<text x="${pad.left + 18}" y="${ly + 2}" font-size="10" fill="${LABEL_COLOR}">${esc(name)}</text>`);
  }

  lines.push("</svg>");
  return lines.join("\n");
};

// ---------------------------------------------------------------------------
// Pie chart
// ---------------------------------------------------------------------------

export type PieChartData = {
  labels: string[];
  values: number[];
  title?: string;
};

export const pieChart = (data: PieChartData) => {
  const W = 400;
  const cx = W / 2, cy = 190;
  const R = 130;
  const n = data.labels.length;
  const total = data.values.reduce((a, b) => a + b, 0);
  if (n === 0 || total === 0) return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 400"><text x="${W / 2}" y="200" text-anchor="middle" fill="${LABEL_COLOR}" font-family="${FONT}" font-size="12">No data</text></svg>`;

  // compute height dynamically to fit legend
  const cols = Math.min(n, 3);
  const legendRows = Math.ceil(n / cols);
  const legendY = cy + R + 24;
  const H = legendY + legendRows * 18 + 16;

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="${FONT}">`,
    `<rect width="${W}" height="${H}" rx="8" fill="${BG_COLOR}"/>`,
  ];

  if (data.title) {
    lines.push(`<text x="${W / 2}" y="28" text-anchor="middle" font-size="13" font-weight="600" fill="${TITLE_COLOR}">${esc(data.title)}</text>`);
  }

  let angle = -Math.PI / 2;
  for (let i = 0; i < n; i++) {
    const val = data.values[i] ?? 0;
    const sliceAngle = (val / total) * 2 * Math.PI;
    const color = COLORS[i % COLORS.length];

    if (n === 1) {
      lines.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${color}" opacity="0.85"/>`);
    } else {
      const x1 = cx + R * Math.cos(angle);
      const y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(angle + sliceAngle);
      const y2 = cy + R * Math.sin(angle + sliceAngle);
      const large = sliceAngle > Math.PI ? 1 : 0;

      lines.push(`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${color}" opacity="0.85" stroke="${BG_COLOR}" stroke-width="2" stroke-linejoin="round"/>`);
    }

    // percentage label on slice
    const midAngle = angle + sliceAngle / 2;
    const pct = ((val / total) * 100).toFixed(0);
    if (sliceAngle > 0.25) {
      const lx = cx + R * 0.65 * Math.cos(midAngle);
      const ly = cy + R * 0.65 * Math.sin(midAngle);
      lines.push(`<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="11" font-weight="600" fill="${BG_COLOR}">${pct}%</text>`);
    }

    angle += sliceAngle;
  }

  // legend
  const colW = W / cols;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lx = col * colW + 20;
    const ly = legendY + row * 18;
    const color = COLORS[i % COLORS.length];
    const label = data.labels[i] ?? "";
    const truncLabel = label.length > 14 ? label.slice(0, 13) + "…" : label;

    lines.push(`<rect x="${lx}" y="${ly}" width="10" height="10" rx="2" fill="${color}" opacity="0.85"/>`);
    lines.push(`<text x="${lx + 15}" y="${ly + 9}" font-size="10" fill="${LABEL_COLOR}">${esc(truncLabel)} (${formatNum(data.values[i] ?? 0)})</text>`);
  }

  lines.push("</svg>");
  return lines.join("\n");
};
