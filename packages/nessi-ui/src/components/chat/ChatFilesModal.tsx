import { For, Show } from "solid-js";
import type { ChatFileMeta } from "../../lib/chat-files.js";
import { formatFileSize } from "../../lib/chat-files.js";

const sectionTitle = (kind: "input" | "output", count: number) =>
  `${count} ${kind} file${count === 1 ? "" : "s"}`;

export const ChatFilesModal = (props: {
  open: boolean;
  inputFiles: ChatFileMeta[];
  outputFiles: ChatFileMeta[];
  onClose: () => void;
  onDeleteInput: (file: ChatFileMeta) => void;
  onDownloadOutput: (file: ChatFileMeta) => void;
}) => {
  const Section = (sectionProps: {
    title: string;
    files: ChatFileMeta[];
    empty: string;
    actionLabel: string;
    onAction: (file: ChatFileMeta) => void;
  }) => (
    <div class="space-y-2">
      <div class="text-xs font-bold uppercase tracking-wider text-gh-fg-secondary">{sectionProps.title}</div>
      <Show when={sectionProps.files.length > 0} fallback={<div class="text-xs text-gh-fg-subtle">{sectionProps.empty}</div>}>
        <div class="ui-list">
          <For each={sectionProps.files}>
            {(file) => (
              <div class="ui-row flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm text-gh-fg-secondary">{file.name}</div>
                  <div class="truncate text-[10px] text-gh-fg-subtle">
                    {file.mountPath} · {file.mimeType || file.sourceType} · {formatFileSize(file.size)}
                  </div>
                </div>
                <button
                  class="btn-secondary shrink-0"
                  onClick={() => sectionProps.onAction(file)}
                >
                  {sectionProps.actionLabel}
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(18,23,30,0.22)] px-4" onClick={props.onClose}>
        <div class="ui-panel hide-scrollbar max-h-[82vh] w-[min(720px,94vw)] overflow-y-auto p-3 space-y-4" onClick={(event) => event.stopPropagation()}>
          <div class="flex items-center gap-2">
            <div class="flex-1 text-xs font-bold uppercase tracking-wider text-gh-fg-secondary">Chat files</div>
            <button class="p-0.5 text-gh-fg-subtle hover:text-gh-fg" onClick={props.onClose}>
              <span class="i ti ti-x text-base" />
            </button>
          </div>

          <Section
            title={sectionTitle("input", props.inputFiles.length)}
            files={props.inputFiles}
            empty="No input files."
            actionLabel="delete"
            onAction={props.onDeleteInput}
          />

          <Section
            title={sectionTitle("output", props.outputFiles.length)}
            files={props.outputFiles}
            empty="No output files."
            actionLabel="download"
            onAction={props.onDownloadOutput}
          />
        </div>
      </div>
    </Show>
  );
};
