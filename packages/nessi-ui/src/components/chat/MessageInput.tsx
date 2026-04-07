import { createEffect, createSignal, on, onMount, Show, For } from "solid-js";
import { matchCommands, type SlashCommand } from "../../lib/slash-commands.js";
import type { UIUserContentPart } from "../../lib/chat-content.js";

/** Keep the textarea compact while allowing multiline input. */
function autoResize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  const lineHeight = 20;
  el.style.height = Math.min(el.scrollHeight, lineHeight * 5) + "px";
}

/** Chat composer with slash-command autocomplete and submit shortcuts. */
export function MessageInput(props: {
  onSend: (text: string) => void;
  onAddImages?: (files: FileList | File[]) => void;
  onRemoveImage?: (index: number) => void;
  images?: UIUserContentPart[];
  canAttachImages?: boolean;
  dropActive?: boolean;
  disabled: boolean;
  placeholder?: string;
}) {
  const [text, setText] = createSignal("");
  const [matches, setMatches] = createSignal<SlashCommand[]>([]);
  const [selectedIdx, setSelectedIdx] = createSignal(0);
  let textareaRef!: HTMLTextAreaElement;
  let fileInputRef!: HTMLInputElement;

  onMount(() => {
    requestAnimationFrame(() => textareaRef.focus());
  });

  createEffect(on(() => props.disabled, () => {
    if (!props.disabled) {
      requestAnimationFrame(() => textareaRef?.focus());
    }
  }));

  function updateMatches(val: string) {
    if (val.startsWith("/") && !val.includes(" ")) {
      const query = val.slice(1);
      setMatches(matchCommands(query));
      setSelectedIdx(0);
    } else {
      setMatches([]);
    }
  }

  function handleInput(e: InputEvent & { currentTarget: HTMLTextAreaElement }) {
    const val = e.currentTarget.value;
    setText(val);
    updateMatches(val);
    autoResize(e.currentTarget);
  }

  async function executeCommand(cmd: SlashCommand) {
    setText("");
    setMatches([]);
    textareaRef.style.height = "auto";
    try {
      await cmd.action();
    } catch (err) {
      console.error("Slash command failed", err);
    }
    requestAnimationFrame(() => textareaRef.focus());
  }

  function handleSend() {
    const t = text().trim();
    const hasImages = (props.images ?? []).some((part) => part.type === "image");
    if ((!t && !hasImages) || props.disabled) return;
    props.onSend(t);
    setText("");
    setMatches([]);
    textareaRef.style.height = "auto";
    requestAnimationFrame(() => textareaRef.focus());
  }

  function handleKeyDown(e: KeyboardEvent) {
    const m = matches();

    // Slash command navigation
    if (m.length > 0) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => (i > 0 ? i - 1 : m.length - 1));
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (i < m.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
        e.preventDefault();
        const cmd = m[selectedIdx()];
        if (cmd) void executeCommand(cmd);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMatches([]);
        return;
      }
    }

    // Normal input
    if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      setText((prev) => prev + "\n");
      requestAnimationFrame(() => autoResize(textareaRef));
    }
  }

  return (
    <div class="px-3 pb-3 pt-3">
      <div class="max-w-4xl mx-auto relative">
        {/* Slash command autocomplete */}
        <Show when={matches().length > 0}>
          <div class="absolute bottom-full left-0 right-0 mb-2">
            <div class="flex flex-col gap-1">
            <For each={matches()}>
              {(cmd, i) => (
                <button
                  class={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    i() === selectedIdx()
                      ? "bg-gh-overlay text-gh-fg"
                      : "bg-transparent text-gh-fg-muted hover:bg-gh-overlay/70 hover:text-gh-fg"
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); void executeCommand(cmd); }}
                >
                  <span class="text-gh-fg-secondary">/{cmd.name}</span>
                  <span class="text-gh-fg-subtle">{cmd.description}</span>
                </button>
              )}
            </For>
            </div>
          </div>
        </Show>

        <Show when={(props.images ?? []).some((part) => part.type === "image")}>
          <div class="mb-2 flex flex-wrap gap-2">
            <For each={(props.images ?? []).filter((part): part is Extract<UIUserContentPart, { type: "image" }> => part.type === "image")}>
              {(image, index) => (
                <div class="relative">
                  <img src={image.src} alt={image.name ?? "selected image"} class="h-16 w-16 rounded-md object-cover" />
                  <button
                    class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-gh-surface text-gh-fg-subtle shadow-sm hover:text-gh-fg"
                    onClick={() => props.onRemoveImage?.(index())}
                  >
                    <span class="i ti ti-x text-[10px]" />
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>

        <div class="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            class="hidden"
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files && files.length > 0) props.onAddImages?.(files);
              event.currentTarget.value = "";
            }}
          />
          <Show when={props.canAttachImages}>
            <button
              class={`ui-panel flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                props.dropActive
                  ? "!bg-emerald-50 text-emerald-600"
                  : "text-gh-fg-subtle hover:text-gh-fg"
              }`}
              onClick={() => fileInputRef.click()}
              title="Attach image"
            >
              <span class="i ti ti-photo-plus text-base leading-none" />
            </button>
          </Show>
          <div class={`ui-panel flex-1 transition-colors focus-within:!bg-gh-surface ${props.dropActive ? "!bg-emerald-50" : ""}`}>
            <div class="px-3 py-2 flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              class="flex-1 resize-none bg-transparent text-sm leading-tight text-gh-fg placeholder-gh-fg-subtle focus:outline-none p-0 m-0 overflow-hidden"
              placeholder={props.placeholder ?? "Ask something or type / ..."}
              rows={1}
              value={text()}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              disabled={props.disabled}
            />
            <button
              class="text-gh-fg-subtle hover:text-gh-fg disabled:opacity-30 text-sm cursor-pointer shrink-0"
              onClick={handleSend}
              disabled={props.disabled || (!text().trim() && !(props.images ?? []).some((part) => part.type === "image"))}
            >
              <span class="i ti ti-arrow-right" />
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
