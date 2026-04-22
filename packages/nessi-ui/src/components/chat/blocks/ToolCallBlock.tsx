import { createSignal, For, Show } from "solid-js";
import type { UIToolCallBlock } from "../types.js";
import { downloadChatFileByPath } from "../../../lib/chat-files.js";
import { haptics } from "../../../shared/browser/haptics.js";
import { PulseDots } from "../../PulseDots.js";

const stringArg = (args: Record<string, unknown> | undefined, key: string, fallback: string) =>
  typeof args?.[key] === "string" ? args[key] : fallback;

const RunningMeta = () => (
  <span class="flex items-center text-gh-fg-subtle">
    <PulseDots />
  </span>
);

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
        if (action === "extract") {
          const urls = args?.urls;
          const urlCount = Array.isArray(urls) ? urls.length : 1;
          return `reading ${urlCount} page${urlCount !== 1 ? "s" : ""}`;
        }
        return stringArg(args, "query", "search");
      },
      present: () => {
        const p = stringArg(args, "path", "");
        return p.split("/").pop() ?? p;
      },
      read_file: () => stringArg(args, "path", "").split("/").pop() ?? "file",
      write_file: () => stringArg(args, "path", "").split("/").pop() ?? "file",
      edit_file: () => stringArg(args, "path", "").split("/").pop() ?? "file",
      list_files: () => `${stringArg(args, "scope", "all")} files`,
      survey: () => stringArg(args, "title", "survey"),
      card: () => {
        const layout = stringArg(args, "layout", "");
        const data = args?.data as Record<string, unknown> | undefined;
        return data?.title ? String(data.title) : layout || "card";
      },
    };

    return headlineMap[name]?.() ?? name;
  };

  const leadingIconClass = () => {
    if (props.block.isError) return "ti-exclamation-circle";
    if (props.block.name === "present") return "ti-folder-open";
    if (props.block.name === "bash") return "ti-tool";
    if (props.block.name === "web") return "ti-world-search";
    if (props.block.name.startsWith("memory_")) return "ti-brain";
    if (props.block.name === "list_files" || props.block.name === "read_file") return "ti-file-search";
    if (props.block.name === "write_file" || props.block.name === "edit_file") return "ti-file-text-spark";
    if (props.block.name === "survey") return "ti-list-check";
    if (props.block.name === "card") return "ti-layout-cards";
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

  const hasResult = () => props.block.result !== undefined;
  const isRunning = () => !hasResult() && props.block.approval !== "pending";
  const isPending = () => props.block.approval === "pending";

  const presentPath = () => stringArg(props.block.args as Record<string, unknown> | undefined, "path", "");

  const canDownloadPresent = () => {
    if (!isPresent() || !props.chatId) return false;
    return /^(\/input|\/output)\//.test(presentPath());
  };

  const isHtmlPresent = () => isPresent() && /\.html?$/i.test(presentPath());

  const handlePresentDownload = (e: MouseEvent) => {
    e.stopPropagation();
    if (!props.chatId) return;
    haptics.tap();
    void downloadChatFileByPath(props.chatId, presentPath());
  };

  const presentHtmlContent = (): string | null => {
    const r = props.block.result;
    if (!r || typeof r !== "object") return null;
    const content = (r as Record<string, unknown>).content;
    return typeof content === "string" ? content : null;
  };

  const handlePrintHtml = (e: MouseEvent) => {
    e.stopPropagation();
    const content = presentHtmlContent();
    if (!content) return;
    haptics.tap();
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  let headRef!: HTMLButtonElement;

  const toggle = () => {
    haptics.tap();
    setExpanded(!expanded());
    requestAnimationFrame(() => headRef.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  };

  return (
    <div class="ui-panel text-[13px] overflow-hidden tool-call-block rounded-md">
      <button
        ref={headRef}
        class="w-full flex items-center gap-1.5 md:gap-2 px-2 py-1 bg-gh-muted hover:bg-gh-subtle text-left tool-call-head"
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
          <RunningMeta />
        </Show>
        <Show when={isHtmlPresent()}>
          <span
            class="icon-action text-sm shrink-0 group/print gap-0.5 inline-flex items-center"
            title="Open in new tab for printing"
            onClick={handlePrintHtml}
          >
            <span class="text-xs font-semibold hidden sm:inline">Print</span>
            <span class="i ti ti-printer group-hover/print:hidden" />
            <span class="i ti ti-external-link hidden group-hover/print:inline-block" />
          </span>
        </Show>
        <Show when={canDownloadPresent()}>
          <span
            class="icon-action text-sm shrink-0 group/dl gap-0.5 inline-flex items-center"
            title="Download"
            onClick={handlePresentDownload}
          >
            <span class="text-xs font-semibold hidden sm:inline">
            Download
            </span>
            <span class="i ti ti-download group-hover/dl:hidden" />
            <span class="i ti ti-file-download hidden group-hover/dl:inline-block" />
          </span>
        </Show>
        <Show when={hasResult() || props.block.args !== undefined}>
          <span class={`i ti ti-chevron-${expanded() ? "up" : "down"} text-gh-fg-subtle text-xs`} />
        </Show>
      </button>
      <Show when={isPending()}>
        <div class="flex items-center gap-2 px-2 py-1.5">
          <button class="btn-secondary danger-text flex items-center gap-1" onClick={() => { haptics.tap(); props.onApproval?.(props.block.callId, "deny"); }}>
            <span class="i ti ti-x text-[11px]" />deny
          </button>
          <button class="btn-primary flex items-center gap-1" onClick={() => { haptics.success(); props.onApproval?.(props.block.callId, "allow"); }}>
            <span class="i ti ti-check text-[11px]" />allow
          </button>
          <button class="btn-secondary flex items-center gap-1" onClick={() => { haptics.success(); props.onApproval?.(props.block.callId, "always"); }}>
            <span class="i ti ti-checks text-[11px]" />always
          </button>
        </div>
      </Show>

      {/* Collapsible details */}
      <Show when={expanded()}>
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
