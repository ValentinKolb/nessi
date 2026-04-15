import { createSignal, For, Show } from "solid-js";
import { downloadChatFileByPath } from "../../../lib/chat-files.js";
import { Portal } from "solid-js/web";
import { haptics } from "../../../shared/browser/haptics.js";

type TableData = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

type PresentResult = {
  status: string;
  path: string;
  name: string;
  contentType: "svg" | "image" | "table" | "text" | "download";
  content?: string;
  tableData?: TableData;
};

const ROWS_PER_PAGE = 20;

const downloadBlob = (content: string, filename: string, mimeType: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const downloadDataUrl = (dataUrl: string, filename: string) => {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
};

const IconButton = (props: { icon: string; title: string; onClick: () => void }) => (
  <button class="icon-action text-xs" title={props.title} onClick={props.onClick}>
    <span class={`i ti ${props.icon}`} />
  </button>
);

const MaximizeButton = (props: { onClick: () => void }) => (
  <button class="icon-action text-sm" title="Maximize" onClick={props.onClick}>
    <span class="i ti ti-arrows-maximize" />
  </button>
);

// ---------------------------------------------------------------------------
// Fullscreen modal
// ---------------------------------------------------------------------------

const FullscreenModal = (props: {
  open: boolean;
  onClose: () => void;
  name: string;
  svgContent?: string;
  imageSrc?: string;
  onDownload: () => void;
}) => (
  <Show when={props.open}>
    <Portal>
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div class="relative flex flex-col items-center gap-3 bg-white rounded-xl p-6 m-4 w-[94vw] h-[94vh] overflow-auto shadow-2xl">
          {/* toolbar */}
          <div class="absolute top-2 right-2 flex gap-1.5">
            <IconButton icon="ti-download" title="Download" onClick={props.onDownload} />
            <IconButton icon="ti-x" title="Close" onClick={props.onClose} />
          </div>

          {/* content */}
          <Show when={props.svgContent}>
            <div class="flex-1 w-full flex items-center justify-center overflow-auto" innerHTML={props.svgContent} />
          </Show>
          <Show when={props.imageSrc}>
            <img src={props.imageSrc} alt={props.name} class="flex-1 min-h-0 w-full object-contain rounded" />
          </Show>

          <span class="text-xs text-gh-fg-subtle">{props.name}</span>
        </div>
      </div>
    </Portal>
  </Show>
);

// ---------------------------------------------------------------------------
// Table with pagination
// ---------------------------------------------------------------------------

const DataTable = (props: { data: TableData }) => {
  const [page, setPage] = createSignal(1);
  const maxPage = () => Math.max(1, Math.ceil(props.data.rows.length / ROWS_PER_PAGE));
  const visibleRows = () => {
    const start = (page() - 1) * ROWS_PER_PAGE;
    return props.data.rows.slice(start, start + ROWS_PER_PAGE);
  };

  return (
    <div class="flex flex-col gap-1.5">
      <div class="overflow-x-auto rounded border border-gh-border-muted">
        <table class="min-w-full text-xs tabular-nums">
          <thead>
            <tr>
              <For each={props.data.headers}>
                {(h) => (
                  <th class="px-2.5 py-1.5 text-left font-medium bg-gh-overlay text-gh-fg-secondary whitespace-nowrap border-b border-gh-border-muted">
                    {h}
                  </th>
                )}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={visibleRows()}>
              {(row, rowIdx) => (
                <tr class={rowIdx() % 2 === 0 ? "bg-gh-surface" : "bg-gh-overlay/40"}>
                  <For each={row}>
                    {(cell) => (
                      <td class="px-2.5 py-1.5 whitespace-nowrap text-gh-fg-muted">{cell}</td>
                    )}
                  </For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-center gap-2 text-[10px] text-gh-fg-subtle">
        <Show when={maxPage() > 1}>
          <button class="btn-secondary py-0.5 px-1.5" disabled={page() <= 1} onClick={() => { haptics.tap(); setPage(page() - 1); }}>
            <span class="i ti ti-chevron-left text-[10px]" />
          </button>
        </Show>
        <span>{props.data.rows.length} rows{maxPage() > 1 ? ` · page ${page()} / ${maxPage()}` : ""}</span>
        <Show when={maxPage() > 1}>
          <button class="btn-secondary py-0.5 px-1.5" disabled={page() >= maxPage()} onClick={() => { haptics.tap(); setPage(page() + 1); }}>
            <span class="i ti ti-chevron-right text-[10px]" />
          </button>
        </Show>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export const isPresentResult = (result: unknown): result is PresentResult =>
  Boolean(result) && typeof result === "object" && "contentType" in (result as Record<string, unknown>);

export const PresentContent = (props: { result: PresentResult; chatId?: string }) => {
  const [fullscreen, setFullscreen] = createSignal(false);

  const ct = () => props.result.contentType;
  const content = () => props.result.content ?? "";
  const name = () => props.result.name;

  const handleDownload = async () => {
    try {
      if (props.chatId && /^(\/input|\/output)\//.test(props.result.path)) {
        await downloadChatFileByPath(props.chatId, props.result.path);
        haptics.success();
        return;
      }
      if (ct() === "svg") {
        downloadBlob(content(), name(), "image/svg+xml");
        haptics.success();
        return;
      }
      if (ct() === "image") {
        downloadDataUrl(content(), name());
        haptics.success();
      }
    } catch (error) {
      haptics.error();
      throw error;
    }
  };

  return (
    <div class="px-2 py-2 space-y-2">
      <Show when={ct() === "svg"}>
        <div class="bg-white rounded p-2 flex flex-col items-center gap-2">
          <div class="max-w-md mx-auto w-full" innerHTML={content()} />
          <MaximizeButton onClick={() => { haptics.tap(); setFullscreen(true); }} />
        </div>
        <FullscreenModal
          open={fullscreen()}
          onClose={() => { haptics.tap(); setFullscreen(false); }}
          name={name()}
          svgContent={content()}
          onDownload={() => void handleDownload()}
        />
      </Show>

      <Show when={ct() === "image"}>
        <div class="bg-white rounded p-2 flex flex-col items-center gap-2">
          <img src={content()} alt={name()} class="max-w-full rounded" />
          <MaximizeButton onClick={() => { haptics.tap(); setFullscreen(true); }} />
        </div>
        <FullscreenModal
          open={fullscreen()}
          onClose={() => { haptics.tap(); setFullscreen(false); }}
          name={name()}
          imageSrc={content()}
          onDownload={() => void handleDownload()}
        />
      </Show>

      <Show when={ct() === "table" && props.result.tableData}>
        <DataTable data={props.result.tableData!} />
      </Show>

      <Show when={ct() === "text"}>
        <pre class="overflow-x-auto whitespace-pre-wrap break-words max-h-72 overflow-y-auto text-xs text-gh-fg-muted bg-gh-surface rounded p-2 border border-gh-border-muted">
          {content()}
        </pre>
      </Show>
    </div>
  );
};
