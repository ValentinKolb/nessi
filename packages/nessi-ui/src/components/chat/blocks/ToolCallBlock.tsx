import { createSignal, For, Show, createEffect, onCleanup } from "solid-js";
import type { UIToolCallBlock } from "../types.js";
import { isPresentResult, PresentContent } from "./PresentContent.js";
import { PulseDots } from "../../PulseDots.js";

const stringArg = (args: Record<string, unknown> | undefined, key: string, fallback: string) =>
  typeof args?.[key] === "string" ? args[key] : fallback;

const formatElapsed = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`;
  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
};

const RunningMeta = (props: { startedAt?: string }) => {
  const [elapsed, setElapsed] = createSignal(0);
  let timer: ReturnType<typeof setInterval> | undefined;

  createEffect(() => {
    if (timer) clearInterval(timer);
    if (!props.startedAt) {
      setElapsed(0);
      return;
    }

    const startedAt = new Date(props.startedAt).getTime();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    update();
    timer = setInterval(update, 1000);
  });

  onCleanup(() => {
    if (timer) clearInterval(timer);
  });

  return (
    <span class="flex items-center gap-1.5 text-[11px] text-gh-fg-subtle">
      <PulseDots />
      <Show when={elapsed() >= 2}>
        <span class="tabular-nums">{formatElapsed(elapsed())}</span>
      </Show>
    </span>
  );
};

/** Collapsible shell command block with approval controls and command output. */
export const ToolCallBlock = (props: { block: UIToolCallBlock; chatId?: string; onApproval?: (callId: string, action: "deny" | "allow" | "always") => void }) => {
  const [expanded, setExpanded] = createSignal(false);

  const isPresent = () => props.block.name === "present";

  const formatValue = (value: unknown): string => {
    if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
    if (value && typeof value === "object") return JSON.stringify(value, null, 2);
    if (typeof value === "string") return value;
    if (value === null) return "null";
    if (typeof value === "undefined") return "";
    return String(value);
  };

  const formatLabel = (key: string) =>
    key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").toLowerCase();

  const headline = () => {
    const args = props.block.args as Record<string, unknown> | undefined;
    const name = props.block.name;

    const headlineMap: Record<string, () => string> = {
      bash: () => stringArg(args, "command", "bash"),
      memory_add: () => `remember ${stringArg(args, "text", "")}`.slice(0, 60),
      memory_remove: () => `forget #${stringArg(args, "id", "?")}`,
      memory_replace: () => `update #${stringArg(args, "id", "?")}`,
      memory_recall: () => "recall all memories",
      web: () => {
        const action = stringArg(args, "action", "search");
        return action === "extract" ? `web extract ${stringArg(args, "url", "")}` : `web search "${stringArg(args, "query", "")}"`;
      },
      present: () => `${stringArg(args, "path", "")}`,
      file_read: () => `read ${stringArg(args, "path", "")}`,
      file_write: () => `write ${stringArg(args, "path", "")}`,
      file_edit: () => `edit ${stringArg(args, "path", "")}`,
      file_list: () => `ls ${stringArg(args, "path", "/")}`,
      survey: () => "survey",
    };

    return headlineMap[name]?.() ?? name;
  };

  const leadingIconClass = () => {
    if (props.block.isError) return "ti-exclamation-circle";
    if (props.block.name === "present") return "ti-folder-open";
    if (props.block.name === "bash") return "ti-tool";
    if (props.block.name === "web") return "ti-search";
    if (props.block.name.startsWith("memory_")) return "ti-brain";
    if (props.block.name === "list_files" || props.block.name === "read_file") return "ti-file-search";
    if (props.block.name === "write_file" || props.block.name === "edit_file") return "ti-file-text-spark";
    return "";
  };

  const argsEntries = () => {
    if (!props.block.args || typeof props.block.args !== "object" || Array.isArray(props.block.args)) {
      return [["value", formatValue(props.block.args)]] as Array<[string, string]>;
    }

    return Object.entries(props.block.args)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [formatLabel(key), formatValue(value)] as [string, string]);
  };

  const argsTitle = () => (props.block.name === "bash" ? "Command" : "Args");

  const commandBody = () => {
    const args = props.block.args as Record<string, unknown> | undefined;
    return typeof args?.command === "string" ? args.command : formatValue(props.block.args);
  };

  const detailTitle = () => (props.block.isError ? "Error" : "Result");

  const detailBody = () => {
    const result = props.block.result;
    if (typeof result === "undefined") return "";
    if (typeof result === "string") return result;

    if (result && typeof result === "object" && !Array.isArray(result)) {
      const record = result as Record<string, unknown>;

      if (typeof record.result === "string" && Object.keys(record).length === 1) {
        return record.result;
      }

      if ("stdout" in record || "stderr" in record || "exitCode" in record) {
        const parts: string[] = [];
        if (record.stdout) parts.push(String(record.stdout));
        if (record.stderr) parts.push(`stderr:\n${String(record.stderr)}`);
        if (typeof record.exitCode !== "undefined") parts.push(`exit code: ${String(record.exitCode)}`);
        return parts.join("\n\n").trim();
      }

      return Object.entries(record)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${formatLabel(key)}: ${formatValue(value)}`)
        .join("\n");
    }

    return formatValue(result);
  };

  const presentResult = () => {
    const r = props.block.result;
    return isPresentResult(r) ? r : null;
  };

  const hasResult = () => props.block.result !== undefined;
  const isRunning = () => !hasResult() && props.block.approval !== "pending";
  const isPending = () => props.block.approval === "pending";

  let headRef!: HTMLButtonElement;

  const toggle = () => {
    if (isPresent()) return;
    setExpanded(!expanded());
    requestAnimationFrame(() => headRef.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div class="ui-panel text-[13px] overflow-hidden tool-call-block rounded-md">
      <button
        ref={headRef}
        class="w-full flex items-center gap-1.5 px-2 py-1 bg-gh-muted hover:bg-gh-subtle text-left tool-call-head"
        onClick={toggle}
      >
        <Show
          when={leadingIconClass()}
          fallback={<span class={`select-none ${props.block.isError ? "text-gh-danger" : "text-gh-fg-subtle"}`}>$</span>}
        >
          {(iconClass) => (
            <span class={`i ti ${iconClass()} text-sm ${props.block.isError ? "text-gh-danger" : "text-gh-fg-subtle"}`} />
          )}
        </Show>
        <span class="text-gh-fg-muted truncate flex-1">{headline()}</span>
        <Show when={isRunning()}>
          <RunningMeta startedAt={props.block.startedAt} />
        </Show>
        <Show when={!isPresent() && (hasResult() || props.block.args !== undefined)}>
          <span class={`i ti ti-chevron-${expanded() ? "up" : "down"} text-gh-fg-subtle text-xs`} />
        </Show>
      </button>
      <Show when={isPending()}>
        <div class="flex items-center gap-2 px-2 py-1.5">
          <button class="btn-secondary danger-text flex items-center gap-1" onClick={() => props.onApproval?.(props.block.callId, "deny")}>
            <span class="i ti ti-x text-[11px]" />deny
          </button>
          <button class="btn-primary flex items-center gap-1" onClick={() => props.onApproval?.(props.block.callId, "allow")}>
            <span class="i ti ti-check text-[11px]" />allow
          </button>
          <button class="btn-secondary flex items-center gap-1" onClick={() => props.onApproval?.(props.block.callId, "always")}>
            <span class="i ti ti-checks text-[11px]" />always
          </button>
        </div>
      </Show>

      {/* Present: inline content, no collapsible */}
      <Show when={isPresent() && presentResult()}>
        {(pr) => <PresentContent result={pr()} chatId={props.chatId} />}
      </Show>

      {/* Other tools: collapsible details */}
      <Show when={!isPresent() && expanded()}>
        <div class="px-2 py-2 space-y-2">
          <Show when={props.block.args !== undefined}>
            <div class="space-y-1">
              <div class="text-[11px] uppercase tracking-[0.1em] text-gh-fg-subtle font-medium">{argsTitle()}</div>
              <Show
                when={props.block.name === "bash"}
                fallback={
                  <div class="space-y-1 text-[12px] text-gh-fg-muted">
                    <For each={argsEntries()}>
                      {(entry) => (
                        <div class="flex items-start gap-2">
                          <span class="shrink-0 text-gh-fg-subtle">{entry[0]}:</span>
                          <span class="min-w-0 whitespace-pre-wrap break-words">{entry[1]}</span>
                        </div>
                      )}
                    </For>
                  </div>
                }
              >
                <pre class="overflow-x-auto whitespace-pre-wrap break-words max-h-32 overflow-y-auto text-[12px] text-gh-fg-muted tool-call-output">
                  {commandBody()}
                </pre>
              </Show>
            </div>
          </Show>
          <Show when={hasResult()}>
            <div class="space-y-1">
              <div class={`text-[11px] uppercase tracking-[0.1em] font-medium ${props.block.isError ? "text-gh-danger" : "text-gh-fg-subtle"}`}>
                {detailTitle()}
              </div>
              <pre class={`overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-xs tool-call-output ${props.block.isError ? "text-gh-danger" : "text-gh-fg-muted"}`}>
                {detailBody()}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};
