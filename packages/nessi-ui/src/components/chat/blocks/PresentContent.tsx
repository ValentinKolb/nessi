import { createSignal, For, Show } from "solid-js";
import { downloadChatFileByPath } from "../../../lib/chat-files.js";
import { Portal } from "solid-js/web";
import { haptics } from "../../../shared/browser/haptics.js";

export type TableData = {
  headers: string[];
  rows: string[][];
  totalRows: number;
};

export type PresentResult = {
  status: string;
  path: string;
  name: string;
  contentType: "svg" | "image" | "table" | "html" | "text" | "download";
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
  <button class="icon-action sm:text-sm text-xs" title="Maximize" onClick={props.onClick}>
    <span class="font-semibold mr-1">Maximize</span>
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
        class="modal-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
      >
        <div
          class="bg-gh-surface border border-gh-border-muted rounded-xl shadow-lg relative flex flex-col items-center p-6 m-4 w-[min(960px,94vw)] h-[90vh]"
        >
          {/* toolbar */}
          <div class="absolute top-2 right-2 flex gap-1.5 z-10">
            <IconButton icon="ti-download" title="Download" onClick={props.onDownload} />
            <IconButton icon="ti-x" title="Close" onClick={props.onClose} />
          </div>

          {/* content — the container is sized, the SVG/img fills it */}
          <Show when={props.svgContent}>
            <div class="flex-1 min-h-0 w-full [&>svg]:w-full [&>svg]:h-full" innerHTML={props.svgContent} />
          </Show>
          <Show when={props.imageSrc}>
            <img src={props.imageSrc} alt={props.name} class="flex-1 min-h-0 w-full object-contain rounded" />
          </Show>

          <p class="text-xs text-gh-fg-subtle text-center mt-2 shrink-0">{props.name}</p>
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
      <div class="ui-table-wrap">
        <table class="ui-table tabular-nums">
          <thead>
            <tr>
              <For each={props.data.headers}>
                {(h) => <th><span class="ui-cell whitespace-nowrap">{h}</span></th>}
              </For>
            </tr>
          </thead>
          <tbody>
            <For each={visibleRows()}>
              {(row) => (
                <tr>
                  <For each={row}>
                    {(cell) => <td><span class="ui-cell whitespace-nowrap">{cell}</span></td>}
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
        <span class="font-mono text-md">{props.data.rows.length} rows{maxPage() > 1 ? ` · page ${page()} / ${maxPage()}` : ""}</span>
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
    <div class="space-y-2">
      <Show when={ct() === "svg"}>
        <div class="flex flex-col items-center gap-2">
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
        <div class="flex flex-col items-center gap-2">
          <img src={content()} alt={name()} class="max-w-full" />
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

      <Show when={ct() === "html"}>
        <iframe
          srcdoc={content()}
          sandbox="allow-same-origin"
          class="w-full border-0 bg-white"
          style={{ height: "500px" }}
          title={name()}
        />
      </Show>

      <Show when={ct() === "text"}>
        <pre class="overflow-x-auto whitespace-pre-wrap break-words max-h-72 overflow-y-auto text-xs text-gh-fg-muted">
          {content()}
        </pre>
      </Show>
    </div>
  );
};
