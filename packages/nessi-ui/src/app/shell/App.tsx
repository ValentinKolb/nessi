import { createEffect, createSignal, Show, onCleanup, onMount } from "solid-js";
import { humanId } from "human-id";
import { ChatModal } from "../../components/ChatModal.js";
import { ChatView } from "../../components/chat/ChatView.js";
import { Settings } from "../../components/settings/Settings.js";
import { OnboardingDialog, shouldShowOnboarding } from "./OnboardingDialog.js";
import { loadProviders, getActiveProviderEntry, setActiveProviderId } from "../../lib/provider.js";
import {
  hasPromptUpdate,
  hasDefaultOverride,
  acceptPromptUpdate,
  acknowledgePromptVersion,
} from "../../lib/prompts.js";
import { registerCommand } from "../../lib/slash-commands.js";
import { deleteChat, getChatMeta, type ChatMeta } from "../../lib/chat-storage.js";
import { startScheduler, stopScheduler, triggerMetadataRefresh } from "../../lib/scheduler.js";
import { readString, writeString } from "../../lib/json-storage.js";
import { loadPersistedEntries } from "../../lib/store.js";
import { messageTime, timeAgo } from "../../lib/date-format.js";
import { dbEvents } from "../../shared/db/db-events.js";
import { browserNotifications } from "../../shared/browser/browser-notifications.js";
import { haptics } from "../../shared/browser/haptics.js";
import { pageAttention } from "../../shared/browser/page-attention.js";

const ACTIVE_CHAT_KEY = "nessi:activeChat";

const newId = () => humanId({ separator: "-", capitalize: false });

const restoreOrNewId = () => readString(ACTIVE_CHAT_KEY) || newId();

/** Top-level application shell with top navigation. */
export const App = () => {
  const [activeChatId, setActiveChatId] = createSignal(restoreOrNewId());
  const [providers, setProviders] = createSignal(loadProviders());
  const [activeProvider, setActiveProvider] = createSignal(getActiveProviderEntry());
  const [activeChatTitle, setActiveChatTitle] = createSignal("");
  const [activeChatMeta, setActiveChatMeta] = createSignal<ChatMeta | null>(null);
  const [activeChatMessageCount, setActiveChatMessageCount] = createSignal(0);
  const [activeChatLastMessageAt, setActiveChatLastMessageAt] = createSignal<string | null>(null);
  const [showUpdateBanner, setShowUpdateBanner] = createSignal(false);
  const [isOverride, setIsOverride] = createSignal(false);
  const [openChats, setOpenChats] = createSignal<() => void>(() => {});
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  let chatInfoRef!: HTMLDialogElement;
  let settingsRef!: HTMLDialogElement;

  const switchChat = (id: string) => {
    // Trigger BG processing for the chat we're leaving
    void triggerMetadataRefresh();
    setActiveChatId(id);
    writeString(ACTIVE_CHAT_KEY, id);
  };

  const newChat = () => switchChat(newId());

  const handleProviderChange = (id: string) => {
    setActiveProviderId(id);
    setActiveProvider(getActiveProviderEntry());
  };

  const refreshProvider = () => {
    setProviders(loadProviders());
    setActiveProvider(getActiveProviderEntry());
  };

  const openSettings = () => settingsRef.showModal();

  const refreshActiveChatInfo = async () => {
    const meta = await getChatMeta(activeChatId());
    const entries = await loadPersistedEntries(activeChatId());
    setActiveChatTitle(meta?.title?.trim() ?? "");
    setActiveChatMeta(meta);
    setActiveChatMessageCount(entries.filter((entry) => entry.kind === "message").length);
    setActiveChatLastMessageAt(entries[entries.length - 1]?.createdAt ?? null);
  };

  const openChatInfo = () => {
    if (!activeChatMeta()) return;
    chatInfoRef.showModal();
  };

  const pageIsActive = () =>
    document.visibilityState === "visible" && document.hasFocus();

  const openHelp = () => { setShowOnboarding(true); };

  const handleSessionComplete = (payload: { chatId: string; finishedAt: string; preview: string }) => {
    if (pageIsActive()) return;
    if (!browserNotifications.canNotify()) return;

    const title = activeChatTitle().trim() || activeChatMeta()?.title?.trim() || "Nessi";
    const body = payload.preview.trim() || `A reply in "${title}" is ready.`;
    const notification = browserNotifications.notify({
      title: `${title} is ready`,
      body,
      tag: `chat:${payload.chatId}`,
    });

    if (!notification) return;

    pageAttention.markUnread();
    notification.onclick = () => {
      pageAttention.clear();
      notification.close();
      window.focus();
    };
  };

  const resumeScheduler = () => {
    void startScheduler();
    void triggerMetadataRefresh();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      pageAttention.clear();
      resumeScheduler();
    }
  };

  const handleWindowFocus = () => {
    pageAttention.clear();
  };

  const refreshPromptBanner = async () => {
    if (!await hasPromptUpdate()) return;
    setIsOverride(await hasDefaultOverride());
    setShowUpdateBanner(true);
  };

  const handleDataChanged = (event: { scope: string }) => {
    if (event.scope === "chats" || event.scope === `chat:${activeChatId()}` || event.scope === "files") {
      void refreshActiveChatInfo();
    }
  };

  onMount(() => {
    pageAttention.init();
    if (shouldShowOnboarding()) setShowOnboarding(true);
    void refreshActiveChatInfo();
    void refreshPromptBanner();

    registerCommand({ name: "new", description: "Start a new chat", action: newChat });
    registerCommand({ name: "chats", description: "Open chats", action: () => openChats()() });
    registerCommand({ name: "settings", description: "Open settings", action: openSettings });
    registerCommand({ name: "help", description: "Open guide", action: openHelp });
    registerCommand({
      name: "clear",
      description: "Clear current chat",
      action: () => { void deleteChat(activeChatId()); switchChat(newId()); },
    });

    void startScheduler();
    window.addEventListener("pageshow", resumeScheduler);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);
    const unsubscribe = dbEvents.subscribe(handleDataChanged);
    onCleanup(unsubscribe);
  });

  createEffect(() => {
    activeChatId();
    void refreshActiveChatInfo();
  });

  onCleanup(() => {
    window.removeEventListener("pageshow", resumeScheduler);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("focus", handleWindowFocus);
    void stopScheduler();
  });

  return (
    <div class="h-screen bg-gh-canvas text-gh-fg flex flex-col">
      {/* ─── Top navigation bar ─── */}
      <header class="flex items-center gap-2 px-3 py-2 shrink-0">
        <button
          class="group flex h-8 w-8 items-center justify-center rounded-lg text-gh-fg"
          onClick={() => { haptics.tap(); newChat(); }}
          title="New chat"
        >
          <span class="relative h-4 w-4">
            <img src="/logo.svg" alt="Nessi" class="absolute inset-0 h-4 w-4 transition-opacity group-hover:opacity-0" />
            <img src="/logo-2.svg" alt="Nessi hover" class="absolute inset-0 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
        </button>

        <Show
          when={activeChatMeta()}
          fallback={<span class="min-w-0 max-w-[min(52vw,22rem)] truncate text-[15px] font-medium tracking-tight">Nessi.sh</span>}
        >
          <button
            class="min-w-0 max-w-[min(52vw,22rem)] truncate rounded-md text-left text-[15px] font-medium tracking-tight text-gh-fg underline-offset-3 transition-colors hover:text-gh-accent hover:underline"
            onClick={() => { haptics.tap(); openChatInfo(); }}
            title="Open chat info"
          >
            {activeChatTitle()}
          </button>
        </Show>

        <div class="flex-1" />

        {/* Help button */}
        <button
          class="flex h-8 w-8 items-center justify-center rounded-lg nav-icon"
          onClick={() => { haptics.tap(); openHelp(); }}
          title="Help & guide"
        >
          <span class="i ti ti-help text-base" />
        </button>

        {/* Chat modal trigger: nav icon with hover animation */}
        <ChatModal
          activeChatId={activeChatId()}
          onSelectChat={switchChat}
          onNewChat={newChat}
          onOpenSettings={openSettings}
          onReady={({ open }) => setOpenChats(() => open)}
        />
      </header>

      {/* ─── Update banner ─── */}
      <Show when={showUpdateBanner()}>
        <div class="mx-3 mb-1 rounded-lg border border-gh-accent/20 bg-gh-accent-subtle px-3 py-2 text-[13px] text-gh-fg">
          <div class="flex items-start gap-2.5">
            <span class="i ti ti-sparkles text-sm text-gh-accent mt-0.5 shrink-0" />
            <div class="flex-1 space-y-0.5">
              <p class="font-medium text-[13px]">System prompt updated</p>
              <Show when={isOverride()} fallback={
                <p class="text-gh-fg-muted text-[12px]">A new version is available and will be used in your next conversation.</p>
              }>
                <p class="text-gh-fg-muted text-[12px]">
                  You have a customized prompt. Switch to the new version? Your customizations will be replaced.
                </p>
              </Show>
              <p class="text-[11px] text-gh-fg-subtle">You can always reset in Settings &rarr; Prompts &rarr; "reset".</p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <Show when={isOverride()}>
                <button
                  class="btn-primary !py-1 !px-2.5"
                  onClick={() => { haptics.success(); void acceptPromptUpdate(); setShowUpdateBanner(false); }}
                >
                  update
                </button>
              </Show>
              <button
                class="btn-secondary !py-1 !px-2.5"
                onClick={() => { haptics.tap(); acknowledgePromptVersion(); setShowUpdateBanner(false); }}
              >
                dismiss
              </button>
            </div>
          </div>
        </div>
      </Show>

      {/* ─── Main content ─── */}
      <div class="flex-1 min-h-0">
        <ChatView
          chatId={activeChatId()}
          providerId={activeProvider()?.id ?? ""}
          providers={providers()}
          activeProviderId={activeProvider()?.id ?? ""}
          onProviderChange={handleProviderChange}
          onOpenSettings={openSettings}
          onSessionComplete={handleSessionComplete}
        />
      </div>

      <Settings ref={(el) => { settingsRef = el; }} onClose={refreshProvider} />
      <OnboardingDialog
        open={showOnboarding()}
        onClose={() => setShowOnboarding(false)}
        onOpenSettings={openSettings}
      />

      <dialog
        ref={chatInfoRef}
        class="modal-dialog w-[min(720px,92vw)] max-h-[82vh]"
        onClick={(e) => { if (e.target === chatInfoRef) { haptics.tap(); chatInfoRef.close(); } }}
      >
        <div class="flex max-h-[82vh] min-h-0 flex-col">
          <div class="px-4 py-3 flex items-center gap-2 border-b border-gh-border-muted">
            <span class="text-[15px] font-semibold flex-1 text-gh-fg">Chat Info</span>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={() => { haptics.tap(); chatInfoRef.close(); }}
              title="Close"
            >
              <span class="i ti ti-x text-base" />
            </button>
          </div>

          <div class="hide-scrollbar min-h-0 flex-1 overflow-y-auto p-4 space-y-3">
            <div class="space-y-1.5">
              <div>
                <p class="text-[11px] uppercase tracking-[0.08em] text-gh-fg-subtle">Title</p>
                <p class="text-[15px] font-medium text-gh-fg">{activeChatMeta()?.title || "Untitled chat"}</p>
              </div>
            </div>

            <div class="space-y-1.5">
              <p class="text-[11px] uppercase tracking-[0.08em] text-gh-fg-subtle">Chat tags</p>
              <Show when={(activeChatMeta()?.topics?.length ?? 0) > 0} fallback={
                <p class="text-[12px] text-gh-fg-subtle">No tags yet.</p>
              }>
                <div class="flex flex-wrap gap-1.5">
                  {activeChatMeta()?.topics?.map((topic) => (
                    <span class="rounded-md bg-gh-muted px-2 py-1 text-[11px] text-gh-fg-muted">
                      {topic}
                    </span>
                  ))}
                </div>
              </Show>
            </div>

            <div class="space-y-1.5">
              <p class="text-[11px] uppercase tracking-[0.08em] text-gh-fg-subtle">Chat metadata</p>
              <div class="grid gap-2 sm:grid-cols-2">
                <div class="ui-metric">
                  <p class="ui-metric-label">Messages</p>
                  <p class="ui-metric-value-strong">{activeChatMessageCount()}</p>
                </div>
                <div class="ui-metric">
                  <p class="ui-metric-label">Last chat</p>
                  <p class="ui-metric-value">
                    {activeChatLastMessageAt() ? `${timeAgo(activeChatLastMessageAt()!)} · ${messageTime(activeChatLastMessageAt()!)}` : "No messages yet"}
                  </p>
                </div>
                <div class="ui-metric">
                  <p class="ui-metric-label">Chat exists since</p>
                  <p class="ui-metric-value">
                    {activeChatMeta()?.createdAt ? `${timeAgo(activeChatMeta()!.createdAt)} · ${messageTime(activeChatMeta()!.createdAt)}` : "Unknown"}
                  </p>
                </div>
                <div class="ui-metric">
                  <p class="ui-metric-label">Last indexed</p>
                  <p class="ui-metric-value">
                    {activeChatMeta()?.lastIndexedAt ? `${timeAgo(activeChatMeta()!.lastIndexedAt!)} · ${messageTime(activeChatMeta()!.lastIndexedAt!)}` : "Not indexed yet"}
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-1.5">
              <p class="text-[11px] uppercase tracking-[0.08em] text-gh-fg-subtle">Chat summary</p>
              <Show when={activeChatMeta()?.description} fallback={
                <p class="text-[13px] leading-6 text-gh-fg-subtle">No summary yet.</p>
              }>
                <p class="text-[13px] leading-6 text-gh-fg-muted whitespace-pre-wrap">
                  {activeChatMeta()?.description}
                </p>
              </Show>
            </div>
          </div>
        </div>
      </dialog>
    </div>
  );
};
