import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import type { Bash } from "just-bash";
import { haptics } from "../../shared/browser/haptics.js";

type HistoryEntry = {
  cwd: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

/**
 * Inline terminal that shares the agent's bash runtime.
 * Renders inside the same `.composer-container` border as the chat input
 * so the transition feels like the container morphs in place.
 */
export const TerminalView = (props: {
  getBash: () => Promise<Bash | null>;
  afterExec?: (bash: Bash) => Promise<void>;
  onClose: () => void;
}) => {
  const [history, setHistory] = createSignal<HistoryEntry[]>([]);
  const [input, setInput] = createSignal("");
  const [cwd, setCwd] = createSignal("/home/user");
  const [running, setRunning] = createSignal(false);
  const [cmdHistory, setCmdHistory] = createSignal<string[]>([]);
  const [histIdx, setHistIdx] = createSignal(-1);

  let scrollRef!: HTMLDivElement;
  let inputRef!: HTMLInputElement;

  const scrollToBottom = () =>
    requestAnimationFrame(() => {
      scrollRef?.scrollTo(0, scrollRef.scrollHeight);
      inputRef?.focus();
    });

  onMount(() => inputRef?.focus());

  let cancelled = false;
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  onCleanup(() => { cancelled = true; if (activeTimer) clearTimeout(activeTimer); });

  const CHUNK_SIZE = 80;
  const CHUNK_DELAY = 12;

  const typewrite = (field: "stdout" | "stderr", full: string): Promise<void> => {
    if (cancelled || full.length <= CHUNK_SIZE) {
      setHistory((h) => { const a = [...h]; const e = a[a.length - 1]; if (e) a[a.length - 1] = { ...e, [field]: full }; return a; });
      scrollToBottom();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let offset = 0;
      const tick = () => {
        if (cancelled) { resolve(); return; }
        offset = Math.min(offset + CHUNK_SIZE, full.length);
        setHistory((h) => { const a = [...h]; const e = a[a.length - 1]; if (e) a[a.length - 1] = { ...e, [field]: full.slice(0, offset) }; return a; });
        scrollToBottom();
        if (offset < full.length) activeTimer = setTimeout(tick, CHUNK_DELAY);
        else { activeTimer = null; resolve(); }
      };
      tick();
    });
  };

  const execCommand = async (cmd: string) => {
    if (!cmd.trim() || running()) return;
    setRunning(true);

    const bash = await props.getBash();
    if (!bash) {
      setHistory((prev) => [...prev, { cwd: cwd(), command: cmd, stdout: "", stderr: "No provider configured. Open Settings to add one.", exitCode: 1 }]);
      setRunning(false);
      scrollToBottom();
      return;
    }
    setCmdHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd).slice(0, 99)]);
    setHistIdx(-1);
    setInput("");
    haptics.tap();

    // Push a placeholder entry immediately (shows the command line)
    setHistory((prev) => [...prev, { cwd: cwd(), command: cmd, stdout: "", stderr: "", exitCode: 0 }]);
    scrollToBottom();

    try {
      const result = await bash.exec(cmd);
      if (result.env?.PWD) setCwd(result.env.PWD);
      // Typewrite stdout, then stderr
      if (result.stdout) await typewrite("stdout", result.stdout);
      if (result.stderr) await typewrite("stderr", result.stderr);
      // Set final exit code
      setHistory((h) => { const a = [...h]; const e = a[a.length - 1]; if (e) a[a.length - 1] = { ...e, exitCode: result.exitCode }; return a; });
      await props.afterExec?.(bash);
    } catch (e) {
      await typewrite("stderr", e instanceof Error ? e.message : "Unexpected error");
      setHistory((h) => { const a = [...h]; const e = a[a.length - 1]; if (e) a[a.length - 1] = { ...e, exitCode: 1 }; return a; });
    }

    setRunning(false);
    scrollToBottom();
  };

  const handleSubmit = () => void execCommand(input().trim());

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }

    const cmds = cmdHistory();
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(histIdx() + 1, cmds.length - 1);
      setHistIdx(next);
      if (cmds[next]) setInput(cmds[next]);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = histIdx() - 1;
      if (next < 0) { setHistIdx(-1); setInput(""); }
      else { setHistIdx(next); if (cmds[next]) setInput(cmds[next]); }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  const promptText = () => {
    const c = cwd();
    return c === "/home/user" ? "~" : c.startsWith("/home/user/") ? `~${c.slice(10)}` : c;
  };

  const QUICK_ACTIONS = [
    { label: "List input files", command: "ls /input/" },
    { label: "List output files", command: "ls /output/" },
    { label: "Available skills", command: "cat /skills/README.md" },
  ];

  return (
    <div class="px-3 pb-3 pt-1">
      <div class="max-w-4xl mx-auto">
        <div
          class="composer-container flex flex-col overflow-hidden"
          style={{ height: "min(420px, 55vh)" }}
        >
          {/* Header */}
          <div class="flex items-center gap-2 px-2 pt-2 pb-1 shrink-0">
            <span class="i ti ti-terminal-2 text-[13px] text-gh-fg-subtle" />
            <span class="text-[12px] text-gh-fg-muted font-medium flex-1">Terminal</span>
            <button
              class="flex h-6 w-6 items-center justify-center rounded-md text-gh-fg-subtle hover:text-gh-fg hover:bg-gh-overlay transition-colors"
              onClick={() => { haptics.tap(); props.onClose(); }}
            >
              <span class="i ti ti-x text-sm" />
            </button>
          </div>

          {/* Output scroll area */}
          <div
            ref={scrollRef}
            class="flex-1 overflow-y-auto hide-scrollbar px-3 pb-2 font-mono text-[13px] leading-[1.6]"
          >
            {/* Empty state — looks like terminal output with clickable commands */}
            <Show when={history().length === 0 && !running()}>
              <div class="pt-2 text-gh-fg-subtle">
                <div class="mb-3">Try one of these:</div>
                <For each={QUICK_ACTIONS}>
                  {(action) => (
                    <button
                      class="block w-full text-left mb-0.5 hover:text-gh-fg transition-colors group"
                      onClick={() => { haptics.tap(); void execCommand(action.command); }}
                    >
                      <span class="text-gh-fg-subtle select-none">{promptText()} $ </span>
                      <span class="text-gh-accent group-hover:underline">{action.command}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            <For each={history()}>
              {(entry) => (
                <div class="mb-1.5">
                  <div>
                    <span class="text-gh-fg-subtle select-none">
                      {entry.cwd === "/home/user" ? "~" : entry.cwd.startsWith("/home/user/") ? `~${entry.cwd.slice(10)}` : entry.cwd}{" $ "}
                    </span>
                    <span class="text-gh-fg">{entry.command}</span>
                  </div>
                  <Show when={entry.stdout}>
                    <pre class="text-gh-fg-muted whitespace-pre-wrap break-words m-0">{entry.stdout}</pre>
                  </Show>
                  <Show when={entry.stderr}>
                    <pre class="text-status-err whitespace-pre-wrap break-words m-0">{entry.stderr}</pre>
                  </Show>
                </div>
              )}
            </For>

            <Show when={running()}>
              <div class="text-gh-fg-subtle animate-pulse">Running…</div>
            </Show>
          </div>

          {/* Input line */}
          <div class="flex items-center gap-1.5 px-3 py-2 shrink-0 border-t border-gh-border-muted font-mono text-[13px]">
            <span class="text-gh-fg-subtle shrink-0 select-none">{promptText()} $ </span>
            <input
              ref={inputRef}
              class="flex-1 bg-transparent text-gh-fg outline-none placeholder:text-gh-fg-subtle placeholder:font-sans"
              value={input()}
              onInput={(e) => { setInput(e.currentTarget.value); setHistIdx(-1); }}
              onKeyDown={handleKeyDown}
              disabled={running()}
              placeholder="Type a command…"
              autocomplete="off"
              autocapitalize="off"
              spellcheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
