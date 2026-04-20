import { createSignal, For, Show } from "solid-js";
import type { ChatFileMeta } from "../../lib/chat-files.js";
import { fileIcons, pprintBytes } from "@valentinkolb/stdlib";
import { haptics } from "../../shared/browser/haptics.js";

const getFileIcon = (name: string) =>
  fileIcons.getFileIcon({ name, type: "file" }).split(" ").filter(c => c.startsWith("ti-")).join(" ");

/* ── Tree data structure ── */

type TreeNode = {
  name: string;
  /** Set on leaf nodes (files). */
  meta?: ChatFileMeta;
  children: TreeNode[];
};

/** Build a tree from flat mount paths. Returns root-level nodes (e.g. "input", "output"). */
const buildTree = (files: ChatFileMeta[]): TreeNode[] => {
  const root: TreeNode = { name: "", children: [] };

  for (const file of files) {
    const parts = file.mountPath.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, children: [] };
        current.children.push(child);
      }
      if (i === parts.length - 1) child.meta = file;
      current = child;
    }
  }

  return root.children;
};

const countFiles = (node: TreeNode): number => {
  if (node.meta) return 1;
  return node.children.reduce((sum, child) => sum + countFiles(child), 0);
};

const isFolder = (node: TreeNode) => !node.meta && node.children.length > 0;

/** Truncate from the middle, preserving start and extension: "LongFileName.xlsx" -> "LongFi...e.xlsx" */
const middleTruncate = (name: string, max = 28) => {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const keep = max - ext.length - 3;
  if (keep < 4) return name.slice(0, max - 3) + "...";
  const front = Math.ceil(keep * 0.6);
  const back = keep - front;
  return stem.slice(0, front) + "..." + stem.slice(-back) + ext;
};

/** Indent step per depth level in px. */
const INDENT = 14;

/* ── Components ── */

const FolderRow = (props: {
  node: TreeNode;
  depth: number;
  onAction: (file: ChatFileMeta) => void;
  actionIcon: string;
  onSecondaryAction?: (file: ChatFileMeta) => void;
  secondaryActionIcon?: string;
  secondaryActionHoverClass?: string;
}) => {
  const [open, setOpen] = createSignal(true);
  const count = () => countFiles(props.node);

  return (
    <>
      <button
        class="w-full flex items-center gap-1.5 py-1 text-left text-[13px] text-gh-fg-secondary hover:text-gh-fg transition-colors pr-2"
        style={{ "padding-left": `${props.depth * INDENT + 4}px` }}
        onClick={() => { haptics.tap(); setOpen(!open()); }}
      >
        <span class={`i ti ${open() ? "ti-chevron-down" : "ti-chevron-right"} text-[10px] text-gh-fg-subtle`} />
        <span class="i ti ti-folder text-gh-fg-subtle text-sm" />
        <span class="truncate">{props.node.name}</span>
        <span class="text-[11px] text-gh-fg-subtle shrink-0">({count()})</span>
      </button>
      <Show when={open()}>
        <div class="relative">
          <div
            class="absolute top-0 bottom-0 border-l border-gh-border-muted"
            style={{ left: `${props.depth * INDENT + 8.5}px` }}
          />
          <For each={props.node.children}>
            {(child) => (
              <Show
                when={isFolder(child)}
                fallback={
                  <FileRow
                    node={child}
                    depth={props.depth + 1}
                    onAction={props.onAction}
                    actionIcon={props.actionIcon}
                    onSecondaryAction={props.onSecondaryAction}
                    secondaryActionIcon={props.secondaryActionIcon}
                    secondaryActionHoverClass={props.secondaryActionHoverClass}
                  />
                }
              >
                <FolderRow
                  node={child}
                  depth={props.depth + 1}
                  onAction={props.onAction}
                  actionIcon={props.actionIcon}
                  onSecondaryAction={props.onSecondaryAction}
                  secondaryActionIcon={props.secondaryActionIcon}
                  secondaryActionHoverClass={props.secondaryActionHoverClass}
                />
              </Show>
            )}
          </For>
        </div>
      </Show>
    </>
  );
};

const FileRow = (props: {
  node: TreeNode;
  depth: number;
  onAction: (file: ChatFileMeta) => void;
  actionIcon: string;
  onSecondaryAction?: (file: ChatFileMeta) => void;
  secondaryActionIcon?: string;
  secondaryActionHoverClass?: string;
}) => {
  const meta = () => props.node.meta!;

  return (
    <div
      class="group flex items-center gap-1.5 py-0.5 text-[13px] pr-2"
      style={{ "padding-left": `${props.depth * INDENT + 4}px` }}
    >
      <span class={`i ti ${getFileIcon(props.node.name)} text-sm text-gh-fg-subtle shrink-0`} />
      <span class="text-gh-fg-muted min-w-0" title={props.node.name}>{middleTruncate(props.node.name)}</span>
      <span class="text-[11px] text-gh-fg-subtle shrink-0 tabular-nums">{pprintBytes(meta().size)}</span>
      <div class="flex-1" />
      <Show when={props.onSecondaryAction && props.secondaryActionIcon}>
        <button
          class={`shrink-0 text-gh-fg-subtle ${props.secondaryActionHoverClass ?? "hover:text-gh-fg"} opacity-0 group-hover:opacity-100 transition-opacity`}
          onClick={() => { haptics.tap(); props.onSecondaryAction!(meta()); }}
        >
          <span class={`i ti ${props.secondaryActionIcon} text-sm`} />
        </button>
      </Show>
      <button
        class="shrink-0 text-gh-fg-subtle hover:text-gh-fg opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => { haptics.tap(); props.onAction(meta()); }}
      >
        <span class={`i ti ${props.actionIcon} text-sm`} />
      </button>
    </div>
  );
};

/* ── Modal ── */

export const ChatFilesModal = (props: {
  open: boolean;
  inputFiles: ChatFileMeta[];
  outputFiles: ChatFileMeta[];
  onClose: () => void;
  onDeleteInput: (file: ChatFileMeta) => void;
  onDownloadOutput: (file: ChatFileMeta) => void;
  onDeleteOutput?: (file: ChatFileMeta) => void;
}) => {
  const tree = () => buildTree([...props.inputFiles, ...props.outputFiles]);

  const inputRoot = () => tree().find((n) => n.name === "input");
  const outputRoot = () => tree().find((n) => n.name === "output");
  const empty = () => props.inputFiles.length === 0 && props.outputFiles.length === 0;

  return (
    <Show when={props.open}>
      <div class="modal-backdrop" onClick={() => { haptics.tap(); props.onClose(); }}>
        <div
          class="modal-panel hide-scrollbar max-h-[82vh] w-[min(480px,94vw)] overflow-y-auto"
          onClick={(event) => event.stopPropagation()}
        >
          {/* Header */}
          <div class="flex items-center gap-2 px-3 py-2.5">
            <span class="i ti ti-files text-gh-fg-subtle" />
            <span class="flex-1 text-[13px] font-semibold text-gh-fg">Files</span>
            <button class="flex h-6 w-6 items-center justify-center rounded-md nav-icon" onClick={() => { haptics.tap(); props.onClose(); }}>
              <span class="i ti ti-x text-sm" />
            </button>
          </div>

          {/* Tree */}
          <div class="px-1 pb-2">
            <Show when={!empty()} fallback={
              <div class="px-3 py-6 text-center text-[13px] text-gh-fg-subtle">No files yet</div>
            }>
              <Show when={inputRoot()}>
                {(node) => (
                  <FolderRow node={node()} depth={0} onAction={props.onDeleteInput} actionIcon="ti-x" />
                )}
              </Show>
              <Show when={outputRoot()}>
                {(node) => (
                  <FolderRow
                    node={node()}
                    depth={0}
                    onAction={props.onDownloadOutput}
                    actionIcon="ti-download"
                    onSecondaryAction={props.onDeleteOutput}
                    secondaryActionIcon="ti-trash"
                    secondaryActionHoverClass="hover:text-gh-danger"
                  />
                )}
              </Show>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
};
