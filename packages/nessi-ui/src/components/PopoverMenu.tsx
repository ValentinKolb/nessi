import { For, Show, type JSX } from "solid-js";

export type PopoverMenuItem = {
  /** Tabler icon class (e.g. "ti-paperclip"). Ignored if iconUrl is set. */
  icon?: string;
  /** URL to an image icon (e.g. "/provider-icons/openai.svg"). Takes precedence over icon. */
  iconUrl?: string;
  label: string;
  /** Optional secondary label shown right-aligned and muted. */
  detail?: string;
  onClick: () => void;
};

const ItemIcon = (props: { icon?: string; iconUrl?: string }) => (
  <Show
    when={props.iconUrl}
    fallback={
      <Show when={props.icon}>
        {(cls) => <span class={`i ti ${cls()} text-sm text-gh-fg-subtle`} />}
      </Show>
    }
  >
    {(url) => <img src={url()} alt="" class="h-3.5 w-3.5 shrink-0" />}
  </Show>
);

/**
 * Minimal popover menu using the native Popover API.
 * Positions itself above or below the trigger button automatically.
 */
export const PopoverMenu = (props: {
  id: string;
  trigger: JSX.Element;
  triggerClass?: string;
  items: PopoverMenuItem[];
  /** Placement: "above" opens upward (default), "below" opens downward. */
  placement?: "above" | "below";
}) => {
  let triggerRef!: HTMLButtonElement;
  let popoverRef!: HTMLDivElement;

  const position = () => {
    const rect = triggerRef.getBoundingClientRect();
    const above = (props.placement ?? "above") === "above";

    popoverRef.style.position = "fixed";
    popoverRef.style.left = `${rect.left}px`;

    if (above) {
      popoverRef.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      popoverRef.style.top = "auto";
    } else {
      popoverRef.style.top = `${rect.bottom + 4}px`;
      popoverRef.style.bottom = "auto";
    }
  };

  const close = () => {
    try { popoverRef.hidePopover(); } catch { /* already hidden */ }
  };

  return (
    <>
      <button
        ref={triggerRef}
        popovertarget={props.id}
        class={props.triggerClass ?? "flex items-center justify-center rounded-md transition-colors text-gh-fg-subtle hover:text-gh-fg hover:bg-gh-overlay"}
        onClick={position}
      >
        {props.trigger}
      </button>

      <div
        ref={popoverRef}
        id={props.id}
        popover="auto"
        class="m-0 p-0 bg-gh-surface rounded-lg shadow-lg overflow-hidden min-w-[160px]"
        style={{ inset: "unset" }}
      >
        <div>
          <For each={props.items}>
            {(item) => (
              <button
                class="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-gh-fg-muted hover:bg-gh-overlay hover:text-gh-fg transition-colors text-left"
                onClick={() => { item.onClick(); close(); }}
              >
                <ItemIcon icon={item.icon} iconUrl={item.iconUrl} />
                <span class="flex-1">{item.label}</span>
                <Show when={item.detail}>
                  <span class="text-[11px] text-gh-fg-subtle">{item.detail}</span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>
    </>
  );
};
