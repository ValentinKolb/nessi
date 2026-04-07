import { createSignal, Show } from "solid-js";
import type { UIToolCallBlock } from "../types.js";

/** Collapsible shell command block with approval controls and command output. */
export function ToolCallBlock(props: { block: UIToolCallBlock; onApproval?: (callId: string, action: "deny" | "allow" | "always") => void }) {
  const [expanded, setExpanded] = createSignal(false);

  const argsStr = () => {
    try {
      const a = props.block.args as Record<string, unknown>;
      if (a && typeof a === "object" && "command" in a) return String(a.command);
      return JSON.stringify(a, null, 2);
    } catch { return String(props.block.args); }
  };

  const resultStr = () => {
    if (props.block.result === undefined) return "";
    try {
      const r = props.block.result as Record<string, unknown>;
      if (r && typeof r === "object" && "stdout" in r) {
        const stdout = String(r.stdout || "");
        const stderr = String(r.stderr || "");
        return stderr ? `${stdout}\n${stderr}` : stdout;
      }
      return JSON.stringify(r, null, 2);
    } catch { return String(props.block.result); }
  };

  const hasResult = () => props.block.result !== undefined;
  const isRunning = () => !hasResult() && props.block.approval !== "pending";
  const isPending = () => props.block.approval === "pending";

  return (
    <div class="my-1 ui-panel text-xs overflow-hidden tool-call-block rounded-md">
      <button
        class="w-full flex items-center gap-1.5 px-2 py-1 bg-gh-overlay hover:bg-gh-muted text-left tool-call-head"
        onClick={() => setExpanded(!expanded())}
      >
        <span class={`select-none ${props.block.isError ? "text-gh-danger" : "text-gh-fg-subtle"}`}>$</span>
        <span class="text-gh-fg-muted truncate flex-1">{argsStr()}</span>
        <Show when={isRunning()}>
          <span class="text-gh-fg-subtle animate-pulse">...</span>
        </Show>
        <Show when={hasResult()}>
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
      <Show when={expanded() && hasResult()}>
        <pre class={`px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-xs tool-call-output ${props.block.isError ? "text-gh-danger" : "text-gh-fg-muted"}`}>
          {resultStr()}
        </pre>
      </Show>
    </div>
  );
}
