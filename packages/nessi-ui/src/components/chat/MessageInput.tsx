import { createEffect, createSignal, on, onMount, Show, For } from "solid-js";
import { matchCommands, registerCommand, type SlashCommand } from "../../lib/slash-commands.js";
import type { UIUserContentPart } from "../../lib/chat-content.js";
import type { PendingChatFile } from "../../lib/chat-files.js";
import type { NextcloudRef } from "../../lib/nextcloud.js";
import type { GitHubRef } from "../../lib/github.js";
import { getProviderIconUrl, type ProviderEntry } from "../../lib/provider.js";
import { pprintBytes } from "@valentinkolb/stdlib";
import { haptics } from "../../shared/browser/haptics.js";
import { PopoverMenu } from "../PopoverMenu.js";

/** Keep the textarea compact while allowing multiline input. */
const autoResize = (el: HTMLTextAreaElement) => {
  el.style.height = "auto";
  const lineHeight = 22;
  el.style.height = Math.min(el.scrollHeight, lineHeight * 6) + "px";
};

/** Chat composer with bordered container, model selector, and file controls. */
export const MessageInput = (props: {
  onSend: (text: string) => void;
  onAddFiles?: (files: FileList | File[]) => void;
  onRemoveImage?: (index: number) => void;
  onRemovePendingFile?: (id: string) => void;
  onRemoveNextcloudRef?: (id: string) => void;
  onRemoveGitHubRef?: (id: string) => void;
  onProviderChange?: (id: string) => void;
  onOpenFiles?: () => void;
  onOpenNextcloudBrowser?: () => void;
  onOpenGitHubBrowser?: () => void;
  onOpenTerminal?: () => void;
  onNewChat?: () => void;
  images?: UIUserContentPart[];
  files?: PendingChatFile[];
  nextcloudRefs?: NextcloudRef[];
  githubRefs?: GitHubRef[];
  providers?: ProviderEntry[];
  activeProviderId?: string;
  inputFileCount?: number;
  outputFileCount?: number;
  isNextcloudConfigured?: boolean;
  isGitHubConfigured?: boolean;
  dropActive?: boolean;
  disabled: boolean;
  placeholder?: string;
}) => {
  const [text, setText] = createSignal("");
  const [matches, setMatches] = createSignal<SlashCommand[]>([]);
  const [selectedIdx, setSelectedIdx] = createSignal(0);
  let textareaRef!: HTMLTextAreaElement;
  let fileInputRef!: HTMLInputElement;
  let folderInputRef!: HTMLInputElement;

  const images = () => props.images ?? [];
  const files = () => props.files ?? [];
  const ncRefs = () => props.nextcloudRefs ?? [];
  const ghRefs = () => props.githubRefs ?? [];
  const providers = () => props.providers ?? [];
  const hasAttachments = () => images().some(p => p.type === "image") || files().length > 0 || ncRefs().length > 0 || ghRefs().length > 0;
  const canSend = () => Boolean(text().trim()) || hasAttachments();
  const inputCount = () => props.inputFileCount ?? 0;
  const outputCount = () => props.outputFileCount ?? 0;
  const hasFiles = () => inputCount() + outputCount() > 0;

  onMount(() => {
    requestAnimationFrame(() => textareaRef.focus());

    registerCommand({
      name: "file",
      description: "Add files",
      action: () => fileInputRef.click(),
    });
    registerCommand({
      name: "folder",
      description: "Add folder",
      action: () => folderInputRef.click(),
    });
    registerCommand({
      name: "nextcloud",
      description: "Browse Nextcloud files",
      action: () => props.onOpenNextcloudBrowser?.(),
    });
    registerCommand({
      name: "github",
      description: "Browse GitHub repos",
      action: () => props.onOpenGitHubBrowser?.(),
    });
  });

  createEffect(on(() => props.disabled, () => {
    if (!props.disabled) {
      // Double rAF ensures the DOM has removed the disabled attribute before focusing
      requestAnimationFrame(() => requestAnimationFrame(() => textareaRef?.focus()));
    }
  }));

  const updateMatches = (val: string) => {
    if (val.startsWith("/") && !val.includes(" ")) {
      setMatches(matchCommands(val.slice(1)));
      setSelectedIdx(0);
    } else {
      setMatches([]);
    }
  };

  const handleInput = (e: InputEvent & { currentTarget: HTMLTextAreaElement }) => {
    const val = e.currentTarget.value;
    setText(val);
    updateMatches(val);
    autoResize(e.currentTarget);
  };

  const executeCommand = async (cmd: SlashCommand) => {
    setText("");
    setMatches([]);
    textareaRef.style.height = "auto";
    try { await cmd.action(); }
    catch (err) { console.error("Slash command failed", err); }
    requestAnimationFrame(() => textareaRef.focus());
  };

  const handleSend = () => {
    const t = text().trim();
    if ((!t && !hasAttachments()) || props.disabled) return;
    props.onSend(t);
    haptics.success();
    setText("");
    setMatches([]);
    textareaRef.style.height = "auto";
    requestAnimationFrame(() => textareaRef.focus());
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const m = matches();

    if (m.length > 0) {
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => (i > 0 ? i - 1 : m.length - 1)); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => (i < m.length - 1 ? i + 1 : 0)); return; }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const cmd = m[selectedIdx()];
        if (cmd) void executeCommand(cmd);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMatches([]); return; }
    }

    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); handleSend(); }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setText((prev) => prev + "\n");
      requestAnimationFrame(() => autoResize(textareaRef));
    }
  };

  return (
    <div class="px-3 pb-3 pt-1">
      <div class="max-w-4xl mx-auto relative">
        {/* Slash command autocomplete */}
        <Show when={matches().length > 0}>
          <div class="absolute bottom-full left-0 right-0 mb-2 z-10">
            <div class="bg-gh-surface border border-gh-border rounded-lg shadow-sm overflow-hidden">
              <For each={matches()}>
                {(cmd, i) => (
                  <button
                    class={`w-full px-3 py-2 text-left text-[13px] flex items-center gap-2 transition-colors ${
                      i() === selectedIdx()
                        ? "bg-gh-accent-subtle text-gh-fg"
                        : "text-gh-fg-muted hover:bg-gh-overlay"
                    }`}
                    onMouseDown={(e) => { e.preventDefault(); haptics.tap(); void executeCommand(cmd); }}
                  >
                    <span class="font-medium text-gh-fg-secondary">/{cmd.name}</span>
                    <span class="text-gh-fg-subtle text-xs">{cmd.description}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,text/*,.txt,.md,.markdown,.csv,.tsv,.xls,.xlsx,.json,.jsonl,.js,.jsx,.mjs,.cjs,.ts,.tsx,.mts,.cts,.html,.htm,.css,.scss,.less,.xml,.yaml,.yml,.toml,.ini,.conf,.env,.log,.sh,.sql,.py,.rb,.php,.go,.rs,.java,.kt,.swift,.dart,.scala,.lua,.r,.pl,.c,.cc,.cpp,.h,.hpp,.cs,.zig,.dockerfile,.gitignore,.gradle,.lock,.mk,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values"
          multiple
          class="hidden"
          onChange={(event) => {
            const f = event.currentTarget.files;
            if (f && f.length > 0) props.onAddFiles?.(f);
            event.currentTarget.value = "";
          }}
        />

        <input
          ref={(el) => { folderInputRef = el; el.setAttribute("webkitdirectory", ""); }}
          type="file"
          multiple
          class="hidden"
          onChange={(event) => {
            const f = event.currentTarget.files;
            if (f && f.length > 0) props.onAddFiles?.(f);
            event.currentTarget.value = "";
          }}
        />

        {/* ─── Bordered composer container ─── */}
        <div class={`composer-container ${props.dropActive ? "drop-active" : ""}`}>
          {/* Attached images */}
          <Show when={images().filter(p => p.type === "image").length > 0}>
            <div class="px-3 pt-3 pb-1 flex flex-wrap gap-2">
              <For each={images().filter((p): p is Extract<UIUserContentPart, { type: "image" }> => p.type === "image")}>
                {(image, index) => (
                  <div class="relative group">
                    <img
                      src={image.src}
                      alt={image.name ?? "image"}
                      class="h-14 w-14 rounded-lg object-cover border border-gh-border-muted"
                    />
                    <button
                      class="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gh-fg text-gh-canvas opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { haptics.tap(); props.onRemoveImage?.(index()); }}
                    >
                      <span class="i ti ti-x text-[8px]" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Attached files */}
          <Show when={files().length > 0}>
            <div class="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
              <For each={files()}>
                {(file) => (
                  <div class="flex items-center gap-1.5 rounded-md bg-gh-muted px-2 py-1 text-xs text-gh-fg-muted group">
                    <span class={`i ${
                      file.sourceType === "pdf" ? "ti ti-file-type-pdf"
                        : file.sourceType === "table" ? "ti ti-table"
                        : "ti ti-file-text"
                    } text-[13px] text-gh-fg-subtle`} />
                    <span class="max-w-[160px] truncate">{file.name}</span>
                    <span class="text-[10px] text-gh-fg-subtle">{pprintBytes(file.size)}</span>
                    <button
                      class="text-gh-fg-subtle hover:text-gh-fg ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { haptics.tap(); props.onRemovePendingFile?.(file.id); }}
                    >
                      <span class="i ti ti-x text-[9px]" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Nextcloud refs */}
          <Show when={ncRefs().length > 0}>
            <div class="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
              <For each={ncRefs()}>
                {(ref) => (
                  <div class="flex items-center gap-1.5 rounded-md bg-gh-muted px-2 py-1 text-xs text-gh-fg-muted group">
                    <span class="i ti ti-brand-nextcloud text-[13px] text-gh-fg-subtle" />
                    <span class="max-w-[160px] truncate">{ref.name}</span>
                    <Show when={!ref.isDir && ref.size > 0}>
                      <span class="text-[10px] text-gh-fg-subtle">{pprintBytes(ref.size)}</span>
                    </Show>
                    <button
                      class="text-gh-fg-subtle hover:text-gh-fg ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { haptics.tap(); props.onRemoveNextcloudRef?.(ref.id); }}
                    >
                      <span class="i ti ti-x text-[9px]" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* GitHub refs */}
          <Show when={ghRefs().length > 0}>
            <div class="px-3 pt-2 pb-1 flex flex-wrap gap-1.5">
              <For each={ghRefs()}>
                {(ref) => (
                  <div class="flex items-center gap-1.5 rounded-md bg-gh-muted px-2 py-1 text-xs text-gh-fg-muted group">
                    <span class={`i ti ${
                      ref.kind === "issue" ? "ti-circle-dot"
                        : ref.kind === "pr" ? "ti-git-pull-request"
                        : ref.kind === "dir" ? "ti-folder"
                        : "ti-brand-github"
                    } text-[13px] text-gh-fg-subtle`} />
                    <span class="max-w-[200px] truncate">{ref.title}</span>
                    <span class="text-[10px] text-gh-fg-subtle">{ref.repo}</span>
                    <button
                      class="text-gh-fg-subtle hover:text-gh-fg ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => { haptics.tap(); props.onRemoveGitHubRef?.(ref.id); }}
                    >
                      <span class="i ti ti-x text-[9px]" />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Textarea */}
          <div class="px-3 pt-2 pb-1">
            <textarea
              ref={textareaRef}
              class="w-full resize-none bg-transparent text-[14px] leading-relaxed text-gh-fg placeholder:text-gh-fg-subtle placeholder:font-light focus:outline-none"
              placeholder={props.placeholder ?? "Ask nessi anything or type / ..."}
              rows={1}
              value={text()}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              disabled={props.disabled}
            />
          </div>

          {/* ─── Bottom toolbar ─── */}
          <div class="flex items-center gap-1 px-2 py-1.5">
            {/* Model selector with chevron */}
            <Show when={providers().length > 0}>
              {(() => {
                const active = () => providers().find(p => p.id === props.activeProviderId);
                return (
                  <PopoverMenu
                    id="model-selector"
                    trigger={
                      <span class="flex items-center gap-1.5">
                        <img src={getProviderIconUrl(active()?.type ?? "openai-compatible")} alt="" class="h-3 w-3" />
                        <span class="text-[12px]">{active()?.model ?? "model"}</span>
                        <span class="i ti ti-chevron-down text-[9px]" />
                      </span>
                    }
                    triggerClass="flex items-center px-1.5 py-1 rounded-md text-gh-fg-subtle hover:text-gh-fg-muted hover:bg-gh-overlay transition-colors cursor-pointer"
                    items={providers().map((p) => ({
                      iconUrl: getProviderIconUrl(p.type),
                      label: p.model,
                      detail: p.name,
                      onClick: () => props.onProviderChange?.(p.id),
                    }))}
                  />
                );
              })()}
            </Show>

            <Show when={providers().length > 0}>
              <span class="text-gh-border text-[10px] select-none">|</span>
            </Show>

            {/* Add files / folder */}
            <PopoverMenu
              id="composer-add-menu"
              trigger={<span class="i ti ti-plus text-[13px]" />}
              triggerClass="flex h-7 w-7 items-center justify-center rounded-md text-gh-fg-subtle hover:text-gh-fg hover:bg-gh-overlay transition-colors"
              items={[
                ...(props.onNewChat ? [{ icon: "ti-message-plus", label: "New chat", onClick: () => props.onNewChat?.() }, { divider: true as const }] : []),
                { icon: "ti-paperclip", label: "Add files", onClick: () => fileInputRef.click() },
                { icon: "ti-folder", label: "Add folder", onClick: () => folderInputRef.click() },
                ...(props.isNextcloudConfigured ? [{ icon: "ti-brand-nextcloud", label: "Nextcloud", onClick: () => props.onOpenNextcloudBrowser?.() }] : []),
                ...(props.isGitHubConfigured ? [{ icon: "ti-brand-github", label: "GitHub", onClick: () => props.onOpenGitHubBrowser?.() }] : []),
              ]}
            />

            {/* Active files indicator: upload icon for input, download icon for output */}
            <Show when={hasFiles()}>
              <span class="text-gh-border text-[10px] select-none">|</span>
              <button
                class="flex items-center gap-1.5 text-[12px] text-gh-fg-subtle hover:text-gh-fg px-1.5 py-1 rounded-md hover:bg-gh-overlay transition-colors"
                onClick={() => { haptics.tap(); props.onOpenFiles?.(); }}
              >
                <Show when={inputCount() > 0}>
                  <span class="flex items-center gap-0.5">
                    <span class="i ti ti-file-upload text-[13px]" />
                    <span>{inputCount()}</span>
                  </span>
                </Show>
                <Show when={inputCount() > 0 && outputCount() > 0}>
                  <span class="text-gh-border text-[9px]">|</span>
                </Show>
                <Show when={outputCount() > 0}>
                  <span class="flex items-center gap-0.5">
                    <span class="i ti ti-file-download text-[13px]" />
                    <span>{outputCount()}</span>
                  </span>
                </Show>
              </button>
            </Show>

            {/* Terminal toggle */}
            <span class="text-gh-border text-[10px] select-none">|</span>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md text-gh-fg-subtle hover:text-gh-fg hover:bg-gh-overlay transition-colors"
              onClick={() => { haptics.tap(); props.onOpenTerminal?.(); }}
              title="Open terminal"
            >
              <span class="i ti ti-terminal-2 text-[13px]" />
            </button>

            <div class="flex-1" />

            {/* Send button — just the arrow, no bg */}
            <button
              class={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                canSend() && !props.disabled
                  ? "text-gh-fg-secondary hover:text-gh-accent"
                  : "text-gh-fg-subtle opacity-30"
              }`}
              onClick={handleSend}
              disabled={props.disabled || !canSend()}
            >
              <span class="i ti ti-arrow-up text-base" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
