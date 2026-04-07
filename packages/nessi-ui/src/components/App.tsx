import { createSignal, Show, For, onCleanup, onMount } from "solid-js";
import { humanId } from "human-id";
import { ChatModal } from "./ChatModal.js";
import { ChatView } from "./chat/ChatView.js";
import { Settings } from "./settings/Settings.js";
import { loadProviders, getActiveProviderEntry, setActiveProviderId } from "../lib/provider.js";
import { loadPrompts, getActivePromptId, setActivePromptId } from "../lib/prompts.js";
import { registerCommand } from "../lib/slash-commands.js";
import { deleteChat } from "../lib/chat-storage.js";
import { refreshChatTitlesInBackground } from "../lib/chat-titles.js";
import { readString, writeString } from "../lib/json-storage.js";

const ACTIVE_CHAT_KEY = "nessi:activeChat";

function newId(): string {
  return humanId({ separator: "-", capitalize: false });
}

function restoreOrNewId(): string {
  return readString(ACTIVE_CHAT_KEY) || newId();
}

/** Top-level application shell for chat, settings and provider/prompt pickers. */
export function App() {
  const [activeChatId, setActiveChatId] = createSignal(restoreOrNewId());
  const [activeProvider, setActiveProvider] = createSignal(getActiveProviderEntry());
  const [activePromptId, setActivePromptLocal] = createSignal(getActivePromptId());
  let settingsRef!: HTMLDialogElement;
  const refreshTitles = () => void refreshChatTitlesInBackground();

  function switchChat(id: string) {
    setActiveChatId(id);
    writeString(ACTIVE_CHAT_KEY, id);
  }

  function newChat() {
    switchChat(newId());
  }

  function handleProviderChange(id: string) {
    setActiveProviderId(id);
    setActiveProvider(getActiveProviderEntry());
  }

  function handlePromptChange(id: string) {
    setActivePromptId(id);
    setActivePromptLocal(id);
  }

  function refreshProvider() {
    setActiveProvider(getActiveProviderEntry());
    setActivePromptLocal(getActivePromptId());
  }

  onMount(() => {
    registerCommand({ name: "new", description: "Start a new chat", action: newChat });
    registerCommand({ name: "settings", description: "Open settings", action: () => settingsRef.showModal() });
    registerCommand({
      name: "clear",
      description: "Clear current chat",
      action: () => {
        deleteChat(activeChatId());
        switchChat(newId());
      },
    });

    window.addEventListener("storage", refreshTitles);
    void refreshChatTitlesInBackground();
  });

  onCleanup(() => {
    window.removeEventListener("storage", refreshTitles);
  });

  return (
    <div class="h-screen bg-gh-canvas text-gh-fg">
      <div class="flex h-full min-h-0">
        <aside class="flex w-12 shrink-0 flex-col items-center px-1 py-3">
          <button
            class="flex h-8 w-8 items-center justify-center rounded-md text-gh-fg-subtle hover:text-gh-fg"
            onClick={newChat}
            title="Nessi"
          >
            <img src="/logo.svg" alt="Nessi" class="h-5 w-5" />
          </button>

          <div class="flex-1" />

          <div class="flex flex-col items-center gap-2">
            <button
              class="flex h-8 w-8 items-center justify-center rounded-md text-gh-fg-subtle hover:text-gh-fg"
              onClick={newChat}
              title="New chat"
            >
              <span class="i ti ti-plus text-sm" />
            </button>

            <ChatModal
              activeChatId={activeChatId()}
              onSelectChat={switchChat}
              onNewChat={newChat}
            />

            <button
              class="flex h-8 w-8 items-center justify-center rounded-md text-gh-fg-subtle hover:text-gh-fg"
              onClick={() => settingsRef.showModal()}
              title="Settings"
            >
              <span class="i ti ti-settings text-sm" />
            </button>
          </div>
        </aside>

        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-2 p-2 text-xs">
            <div class="flex-1" />
            <select
              class="ui-input !w-auto !min-w-[190px] !py-1 !px-2 cursor-pointer"
              value={activePromptId()}
              onChange={(e) => handlePromptChange(e.currentTarget.value)}
            >
              <For each={loadPrompts()}>
                {(p) => <option value={p.id}>{p.name}</option>}
              </For>
            </select>
            <select
              class="ui-input !w-auto !min-w-[220px] !py-1 !px-2 cursor-pointer"
              value={activeProvider()?.id ?? ""}
              onChange={(e) => handleProviderChange(e.currentTarget.value)}
            >
              <For each={loadProviders()}>
                {(p) => <option value={p.id}>{p.name} ({p.model})</option>}
              </For>
              <Show when={loadProviders().length === 0}>
                <option value="">no provider</option>
              </Show>
            </select>
          </div>
          <div class="flex-1 min-h-0">
            <ChatView
              chatId={activeChatId()}
              providerId={activeProvider()?.id ?? ""}
              onOpenSettings={() => settingsRef.showModal()}
            />
          </div>
        </div>
      </div>
      <Settings ref={(el) => { settingsRef = el; }} onClose={refreshProvider} />
    </div>
  );
}
