import { createSignal, For, onMount, Show } from "solid-js";
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

  const exec = async () => {
    const cmd = input().trim();
    if (!cmd || running()) return;

    const bash = await props.getBash();
    if (!bash) {
      setHistory((prev) => [...prev, { cwd: cwd(), command: cmd, stdout: "", stderr: "No runtime available. Send a message first to initialize.", exitCode: 1 }]);
      setInput("");
      scrollToBottom();
      return;
    }

    setRunning(true);
    setCmdHistory((prev) => [cmd, ...prev.filter((c) => c !== cmd).slice(0, 99)]);
    setHistIdx(-1);
    setInput("");
    haptics.tap();

    try {
      const result = await bash.exec(cmd);
      setHistory((prev) => [...prev, { cwd: cwd(), command: cmd, stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }]);
      if (result.env?.PWD) setCwd(result.env.PWD);
      await props.afterExec?.(bash);
    } catch (e) {
      setHistory((prev) => [...prev, { cwd: cwd(), command: cmd, stdout: "", stderr: e instanceof Error ? e.message : "Unexpected error", exitCode: 1 }]);
    }

    setRunning(false);
    scrollToBottom();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void exec();
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
      if (next < 0) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(next);
        if (cmds[next]) setInput(cmds[next]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      props.onClose();
    }
  };

  const prompt = () => {
    const c = cwd();
    const short = c === "/home/user" ? "~" : c.startsWith("/home/user/") ? `~${c.slice(10)}` : c;
    return `${short} $`;
  };

  return (
    <div class="px-3 pb-3 pt-1">
      <div class="max-w-4xl mx-auto">
        <div
          class="composer-container flex flex-col overflow-hidden"
          style={{ height: "min(420px, 55vh)" }}
        >
          {/* Header */}
          <div class="flex items-center gap-2 px-3 py-1.5 shrink-0">
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
            <Show when={history().length === 0}>
              <div class="text-gh-fg-subtle py-4 text-center text-[12px] font-sans">
                Same bash environment as the agent — all skills and files available.
              </div>
            </Show>

            <For each={history()}>
              {(entry) => (
                <div class="mb-1.5">
                  <div>
                    <span class="text-gh-fg-subtle select-none">{entry.cwd === "/home/user" ? "~" : entry.cwd.startsWith("/home/user/") ? `~${entry.cwd.slice(10)}` : entry.cwd} $ </span>
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
            <span class="text-gh-fg-subtle shrink-0 select-none">{prompt()} </span>
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
