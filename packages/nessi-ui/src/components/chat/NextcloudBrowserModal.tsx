import { createEffect, createSignal, For, on, Show } from "solid-js";
import { nextcloudApi } from "../../lib/nextcloud.js";
import type { NextcloudRef } from "../../lib/nextcloud.js";
import { parsePropfind, PROPFIND_BODY, type DavEntry } from "../../lib/nextcloud-fs.js";
import { getFileIcon } from "../../lib/file-icons.js";
import { formatFileSize } from "../../lib/chat-files.js";
import { haptics } from "../../shared/browser/haptics.js";

/** Nextcloud file browser modal for selecting files/folders as context references. */
export const NextcloudBrowserModal = (props: {
  open: boolean;
  onClose: () => void;
  onSelect: (refs: NextcloudRef[]) => void;
}) => {
  const [currentPath, setCurrentPath] = createSignal("/");
  const [entries, setEntries] = createSignal<DavEntry[]>([]);
  const [selected, setSelected] = createSignal<Map<string, NextcloudRef>>(new Map());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const entryPath = (entry: DavEntry) =>
    currentPath() === "/" ? `/${entry.name}` : `${currentPath()}/${entry.name}`;

  const isSelected = (entry: DavEntry) => selected().has(entryPath(entry));
  const selectedCount = () => selected().size;

  const loadDir = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const xml = await nextcloudApi.webdav("PROPFIND", path, PROPFIND_BODY);
      const all = parsePropfind(xml);
      setEntries(all.slice(1));
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  createEffect(on(() => props.open, (isOpen) => {
    if (isOpen) {
      setCurrentPath("/");
      setEntries([]);
      setSelected(new Map());
      setError(null);
      void loadDir("/");
    }
  }));

  const toggleSelect = (entry: DavEntry) => {
    const path = entryPath(entry);
    haptics.tap();
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(path)) next.delete(path);
      else next.set(path, { id: crypto.randomUUID(), path, name: entry.name, isDir: entry.isDir, size: entry.size, mime: entry.mime });
      return next;
    });
  };

  const navigateInto = (entry: DavEntry) => {
    void loadDir(entryPath(entry));
  };

  const confirmSelection = () => {
    haptics.success();
    props.onSelect([...selected().values()]);
  };

  const breadcrumbs = () => {
    const parts = currentPath().split("/").filter(Boolean);
    return [
      { name: "Nextcloud", path: "/" },
      ...parts.map((name, i) => ({ name, path: "/" + parts.slice(0, i + 1).join("/") })),
    ];
  };

  const sortedEntries = () =>
    [...entries()].sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  /**
   * Single icon slot that transitions between file icon and checkbox:
   * - Default:          file/folder icon (subtle)
   * - Hover:            empty checkbox (accent)
   * - Selected:         checkmark (accent)
   * - Selected + hover: filled checkbox (accent)
   */
  const SelectIcon = (p: { entry: DavEntry; icon: string }) => (
    <span class="w-3.5 shrink-0 flex items-center justify-center">
      <Show
        when={isSelected(p.entry)}
        fallback={<>
          <span class={`i ti ${p.icon} text-[13px] text-gh-fg-subtle group-hover:hidden`} />
          <span class="i ti ti-square text-[13px] text-gh-accent hidden group-hover:inline" />
        </>}
      >
        <span class="i ti ti-check text-[13px] text-gh-accent group-hover:hidden" />
        <span class="i ti ti-square-check text-[13px] text-gh-accent hidden group-hover:inline" />
      </Show>
    </span>
  );

  return (
    <Show when={props.open}>
      <div class="modal-backdrop" onClick={() => { haptics.tap(); props.onClose(); }}>
        <div
          class="modal-panel w-[min(480px,94vw)] h-[min(520px,80vh)] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center gap-2 px-3 py-2.5 shrink-0">
            <span class="i ti ti-brand-nextcloud text-gh-fg-subtle" />
            <span class="flex-1 text-[13px] font-semibold text-gh-fg">Nextcloud</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded-md nav-icon"
              onClick={() => { haptics.tap(); props.onClose(); }}
            >
              <span class="i ti ti-x text-sm" />
            </button>
          </div>

          {/* Breadcrumbs */}
          <div class="flex items-center gap-1 px-3 pb-2 text-[12px] flex-wrap shrink-0">
            <For each={breadcrumbs()}>
              {(crumb, i) => (
                <>
                  <Show when={i() > 0}>
                    <span class="text-gh-fg-subtle select-none">/</span>
                  </Show>
                  <button
                    class="text-gh-fg-muted hover:text-gh-accent transition-colors truncate max-w-[120px]"
                    onClick={() => { haptics.tap(); void loadDir(crumb.path); }}
                  >
                    {crumb.name}
                  </button>
                </>
              )}
            </For>
          </div>

          {/* Scrollable file list */}
          <div class="flex-1 overflow-y-auto hide-scrollbar px-1">
            <Show when={loading()}>
              <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">Loading…</div>
            </Show>

            <Show when={error()}>
              <div class="px-3 py-8 text-center text-[13px] text-gh-danger">{error()}</div>
            </Show>

            <Show when={!loading() && !error()}>
              <Show when={sortedEntries().length === 0}>
                <div class="px-3 py-8 text-center text-[13px] text-gh-fg-subtle">Empty folder</div>
              </Show>

              <For each={sortedEntries()}>
                {(entry) => (
                  <Show
                    when={entry.isDir}
                    fallback={
                      <button
                        class="group w-full flex items-center gap-2 py-1.5 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors text-left"
                        onClick={() => toggleSelect(entry)}
                      >
                        <SelectIcon entry={entry} icon={getFileIcon(entry.name)} />
                        <span class="text-gh-fg-muted min-w-0 truncate flex-1">{entry.name}</span>
                        <span class="text-[11px] text-gh-fg-subtle shrink-0 tabular-nums">
                          {formatFileSize(entry.size)}
                        </span>
                      </button>
                    }
                  >
                    <div class="group flex items-center gap-2 py-1.5 px-3 text-[13px] rounded-md hover:bg-gh-overlay transition-colors">
                      <button class="shrink-0" onClick={() => toggleSelect(entry)}>
                        <SelectIcon entry={entry} icon="ti-folder" />
                      </button>
                      <button
                        class="text-gh-fg-muted hover:text-gh-fg min-w-0 truncate text-left flex-1"
                        onClick={() => { haptics.tap(); navigateInto(entry); }}
                      >
                        {entry.name}
                      </button>
                    </div>
                  </Show>
                )}
              </For>
            </Show>
          </div>

          {/* Footer */}
          <div class="border-t border-gh-border-muted px-3 py-2 shrink-0 flex items-center justify-end gap-2">
            <button
              class="px-3 py-1.5 text-[12px] text-gh-fg-muted hover:text-gh-fg rounded-md hover:bg-gh-overlay transition-colors"
              onClick={() => { haptics.tap(); props.onClose(); }}
            >
              Cancel
            </button>
            <button
              class={`px-3 py-1.5 text-[12px] rounded-md transition-colors ${
                selectedCount() > 0
                  ? "bg-gh-accent text-white hover:opacity-90"
                  : "bg-gh-muted text-gh-fg-subtle cursor-not-allowed"
              }`}
              disabled={selectedCount() === 0}
              onClick={confirmSelection}
            >
              Use {selectedCount()} {selectedCount() === 1 ? "file" : "files"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
};
