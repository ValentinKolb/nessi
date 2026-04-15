import { Switch, Match } from "solid-js";
import type { UIApprovalBlock } from "../types.js";
import { haptics } from "../../../shared/browser/haptics.js";

/** Render a custom approval request block with allow/deny actions. */
export const ApprovalBlock = (props: {
  block: UIApprovalBlock;
  onApproval?: (callId: string, action: "deny" | "allow" | "always") => void;
}) => (
  <div class="my-1 text-[13px] ui-panel px-3 py-2">
    <p class="text-gh-fg-secondary">{props.block.message}</p>
    <Switch>
      <Match when={props.block.status === "pending"}>
        <div class="flex gap-2 mt-2">
          <button
            class="btn-primary"
            onClick={() => { haptics.success(); props.onApproval?.(props.block.callId, "allow"); }}
          >
            approve
          </button>
          <button
            class="btn-secondary danger-text"
            onClick={() => { haptics.tap(); props.onApproval?.(props.block.callId, "deny"); }}
          >
            deny
          </button>
        </div>
      </Match>
      <Match when={props.block.status === "approved"}>
        <span class="text-gh-fg-subtle mt-1 inline-block">Approved</span>
      </Match>
      <Match when={props.block.status === "denied"}>
        <span class="text-gh-danger mt-1 inline-block">Denied</span>
      </Match>
    </Switch>
  </div>
);
