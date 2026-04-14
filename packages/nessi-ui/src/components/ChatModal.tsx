import { createMemo, createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { deleteChat as deleteChatData, listChatMetas, type ChatMeta } from "../lib/chat-storage.js";
import { timeAgo } from "../lib/date-format.js";
import { dbEvents } from "../shared/db/db-events.js";

/** Chat switcher modal — doubles as mobile menu with settings + new chat. */
export const ChatModal = (props: {
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onOpenSettings?: () => void;
  onReady?: (api: { open: () => void }) => void;
}) => {
  let dialogRef!: HTMLDialogElement;
  const [chats, setChats] = createSignal<ChatMeta[]>([]);
  const [query, setQuery] = createSignal("");

  const refresh = async () => setChats(await listChatMetas());

  const filteredChats = createMemo(() => {
    const q = query().trim().toLowerCase();
    if (!q) return chats();

    return chats().filter((chat) => {
      const haystack = [
        chat.title,
        chat.description ?? "",
        ...(chat.topics ?? []),
      ].join("\n").toLowerCase();
      return haystack.includes(q);
    });
  });

  onMount(() => {
    void refresh();
    props.onReady?.({ open });
    const unsubscribe = dbEvents.subscribe((event) => {
      if (event.scope === "chats") void refresh();
    });
    onCleanup(unsubscribe);
  });

  const open = () => {
    void refresh();
    setQuery("");
    dialogRef.showModal();
  };
  const close = () => {
    setQuery("");
    dialogRef.close();
  };

  const selectChat = (id: string) => { props.onSelectChat(id); close(); };
  const newChat = () => { props.onNewChat(); close(); };

  const openSettings = () => {
    close();
    props.onOpenSettings?.();
  };

  const deleteChat = (id: string) => {
    void deleteChatData(id);
    void refresh();
    if (id === props.activeChatId) newChat();
  };

  return (
    <>
      <button
        class="group flex h-7 w-7 items-center justify-center rounded-lg nav-icon cursor-pointer"
        onClick={open}
        title="Menu"
      >
        <span class="i ti ti-bubble-text text-base group-hover:hidden" />
        <span class="i ti ti-bubble-plus text-base hidden group-hover:inline" />
      </button>

      <dialog
        ref={dialogRef}
        class="m-auto bg-gh-surface text-gh-fg p-0 w-[min(760px,94vw)] max-h-[84vh] overflow-hidden rounded-xl border border-gh-border-muted"
        onClick={(e) => { if (e.target === dialogRef) close(); }}
      >
        <div class="flex max-h-[84vh] min-h-0 flex-col">
          {/* Header */}
          <div class="px-4 py-3 flex items-center gap-2 border-b border-gh-border-muted">
            <span class="text-[15px] font-semibold flex-1 text-gh-fg">Chats</span>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={newChat}
              title="New chat"
            >
              <span class="i ti ti-plus text-base" />
            </button>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={openSettings}
              title="Settings"
            >
              <span class="i ti ti-settings text-base" />
            </button>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={close}
              title="Close"
            >
              <span class="i ti ti-x text-base" />
            </button>
          </div>

          {/* Chat list */}
          <div class="hide-scrollbar min-h-0 flex-1 overflow-y-auto bg-gh-canvas/40">
            <Show when={chats().length > 0} fallback={
              <div class="px-4 py-8 text-[13px] text-gh-fg-subtle text-center">No chats yet</div>
            }>
              <div class="px-3 pt-3">
                <input
                  class="ui-input"
                  type="text"
                  placeholder="Search title, tags, description..."
                  value={query()}
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
              </div>
              <Show when={filteredChats().length > 0} fallback={
                <div class="px-4 py-8 text-[13px] text-gh-fg-subtle text-center">No matching chats</div>
              }>
                <div class="p-3 space-y-2">
                  <For each={filteredChats()}>
                  {(chat) => (
                    <button
                      class={`w-full text-left group min-w-0 rounded-xl border px-3.5 py-3 transition-colors ${
                        chat.id === props.activeChatId
                          ? "border-gh-accent/25 bg-gh-accent-subtle text-gh-fg"
                          : "border-gh-border-muted bg-gh-surface text-gh-fg-muted hover:bg-gh-overlay hover:text-gh-fg"
                      }`}
                      onClick={() => selectChat(chat.id)}
                    >
                      <div class="flex items-start gap-3">
                        <div class="min-w-0 flex-1 space-y-1.5">
                          <div class="flex items-start gap-2">
                            <span class="min-w-0 flex-1 text-[13px] font-medium text-gh-fg truncate">
                              {chat.title || "New chat"}
                            </span>
                            <div class="flex shrink-0 items-center gap-1.5">
                              <span class="text-[11px] text-gh-fg-subtle tabular-nums">
                                {timeAgo(chat.createdAt)}
                              </span>
                              <span
                                class="group/delete flex h-5 w-5 items-center justify-center rounded-md text-gh-fg-subtle transition-all hover:text-gh-danger"
                                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Delete chat"
                                role="button"
                                tabindex={0}
                              >
                                <span class="i ti ti-x text-xs group-hover/delete:hidden" />
                                <span class="i ti ti-trash text-xs hidden group-hover/delete:inline" />
                              </span>
                            </div>
                          </div>

                          <Show when={chat.description}>
                            <p class="line-clamp-2 text-[12px] leading-5 text-gh-fg-muted">
                              {chat.description}
                            </p>
                          </Show>

                          <Show when={(chat.topics?.length ?? 0) > 0}>
                            <div class="flex flex-wrap gap-1.5">
                              <For each={chat.topics ?? []}>
                                {(topic) => (
                                  <span class="rounded-md bg-gh-muted px-2 py-0.5 text-[10px] text-gh-fg-muted">
                                    {topic}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </div>
                    </button>
                  )}
                  </For>
                </div>
              </Show>
            </Show>
          </div>
        </div>
      </dialog>
    </>
  );
};
