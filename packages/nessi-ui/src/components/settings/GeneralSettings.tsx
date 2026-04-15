import { createSignal, onMount, Show } from "solid-js";
import { browserNotifications, type BrowserNotificationStatus } from "../../shared/browser/browser-notifications.js";
import { haptics } from "../../shared/browser/haptics.js";

const statusCopy = (status: BrowserNotificationStatus) => {
  switch (status) {
    case "enabled":
      return {
        label: "enabled",
        tone: "bg-emerald-100 text-emerald-700",
        message: "Browser notifications are allowed. Nessi can notify you when a background chat reply is ready.",
      };
    case "blocked":
      return {
        label: "blocked",
        tone: "bg-red-100 text-red-700",
        message: "Notifications are blocked by the browser. Re-enable them in your browser's site settings for this page.",
      };
    case "default":
      return {
        label: "not enabled",
        tone: "bg-gh-muted text-gh-fg-muted",
        message: "Notifications are not enabled yet. You can allow them here once, or later through the browser prompt.",
      };
    default:
      return {
        label: "unsupported",
        tone: "bg-gh-muted text-gh-fg-muted",
        message: "This browser does not support notifications in this environment.",
      };
  }
};

export const GeneralSettings = () => {
  const [status, setStatus] = createSignal<BrowserNotificationStatus>("default");
  const [hapticsEnabled, setHapticsEnabled] = createSignal(true);

  const refresh = async () => {
    setStatus(browserNotifications.getStatus());
    await haptics.init();
    setHapticsEnabled(haptics.isEnabled());
  };

  const allowNow = async () => {
    await browserNotifications.requestAccess();
    haptics.success();
    await refresh();
  };

  const toggleHaptics = async () => {
    const next = !hapticsEnabled();
    await haptics.setEnabled(next);
    setHapticsEnabled(next);
    if (next) haptics.tap();
  };

  onMount(() => {
    void refresh();
  });

  const current = () => statusCopy(status());

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-adjustments" />
          <span>General</span>
        </h3>
        <span class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${current().tone}`}>
          {current().label}
        </span>
      </div>

      <p class="settings-desc">
        {current().message}
      </p>

      <Show when={status() === "default"}>
        <div class="ui-actions-end">
          <button class="btn-primary" onClick={() => void allowNow()}>
            allow notifications
          </button>
        </div>
      </Show>

      <Show when={status() === "blocked"}>
        <p class="text-[12px] text-gh-fg-subtle">
          Open the browser site settings for this app and switch notifications back to <span class="font-medium text-gh-fg">Allow</span>.
        </p>
      </Show>

      <div class="border-t border-gh-border-muted pt-2 space-y-1.5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-[13px] text-gh-fg">Haptics</p>
            <p class="text-[12px] text-gh-fg-subtle">
              Subtle vibration feedback for taps, saves, approvals, and errors on supported devices.
            </p>
          </div>
          <span class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
            !haptics.isSupported()
              ? "bg-gh-muted text-gh-fg-muted"
              : hapticsEnabled()
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gh-muted text-gh-fg-muted"
          }`}>
            {!haptics.isSupported() ? "unsupported" : hapticsEnabled() ? "enabled" : "disabled"}
          </span>
        </div>
        <Show when={haptics.isSupported()}>
          <div class="ui-actions-end">
            <button class="btn-secondary" onClick={() => void toggleHaptics()}>
              {hapticsEnabled() ? "disable haptics" : "enable haptics"}
            </button>
          </div>
        </Show>
      </div>
    </div>
  );
};
