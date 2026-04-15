import { Show } from "solid-js";
import { haptics } from "../../shared/browser/haptics.js";

export const NotificationConsentDialog = (props: {
  open: boolean;
  onEnable: () => void;
  onDismiss: () => void;
}) => (
  <Show when={props.open}>
    <div
      class="modal-backdrop"
      onClick={() => { haptics.tap(); props.onDismiss(); }}
    >
      <div
        class="modal-panel w-[min(32rem,92vw)] p-4"
        onClick={(event) => event.stopPropagation()}
      >
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <span class="i ti ti-bell text-gh-fg-subtle" />
            <h3 class="text-[15px] font-semibold text-gh-fg">Browser notifications</h3>
          </div>
          <p class="text-[13px] leading-6 text-gh-fg-muted">
            Nessi can notify you when a chat reply is finished while this tab is in the background.
          </p>
          <p class="text-[12px] text-gh-fg-subtle">
            This only sends a small browser notification and temporarily marks the favicon until you return.
          </p>
        </div>

        <div class="ui-actions mt-4">
          <div class="ui-actions-right">
            <button class="btn-secondary" onClick={() => { haptics.tap(); props.onDismiss(); }}>no thanks</button>
            <button class="btn-primary" onClick={() => { haptics.success(); props.onEnable(); }}>allow notifications</button>
          </div>
        </div>
      </div>
    </div>
  </Show>
);
