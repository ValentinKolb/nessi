import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { deleteChat as deleteChatData, listChatMetas, type ChatMeta } from "../lib/chat-storage.js";

/** Dialog listing chats and quick chat actions. */
export const ChatModal = (props: {
  activeChatId: string;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
}) => {
  let dialogRef!: HTMLDialogElement;
  const [chats, setChats] = createSignal<ChatMeta[]>([]);

  const refresh = () => { setChats(listChatMetas()); };

  onMount(() => {
    refresh();
    window.addEventListener("storage", refresh);
  });

  onCleanup(() => {
    window.removeEventListener("storage", refresh);
  });

  const open = () => {
    refresh();
    dialogRef.showModal();
  };

  const close = () => {
    dialogRef.close();
  };

  const selectChat = (id: string) => {
    props.onSelectChat(id);
    close();
  };

  const newChat = () => {
    props.onNewChat();
    close();
  };

  const deleteChat = (id: string) => {
    deleteChatData(id);
    refresh();
    if (id === props.activeChatId) newChat();
  };

  return (
    <>
      <button
        class="p-1 text-gh-fg-subtle hover:text-gh-fg cursor-pointer"
        onClick={open}
        title="Chats"
      >
        <span class="i ti ti-messages text-sm" />
      </button>

      <dialog
        ref={dialogRef}
        class="m-auto bg-gh-surface text-gh-fg p-0 w-[min(620px,94vw)] max-h-[82vh] overflow-hidden shadow-lg"
        onClick={(e) => { if (e.target === dialogRef) close(); }}
      >
        <div class="flex max-h-[82vh] min-h-0 flex-col">
          <div class="px-4 py-3 flex items-center gap-2 bg-gh-overlay rounded-t-md">
            <span class="text-sm font-bold flex-1 text-gh-fg-secondary tracking-wider uppercase">nessi</span>
            <button
              class="p-0.5 text-gh-fg-subtle hover:text-gh-fg"
              onClick={close}
              title="Close"
            >
              <span class="i ti ti-x text-base" />
            </button>
          </div>
          <div class="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
            <Show when={chats().length > 0} fallback={
              <div class="px-4 py-6 text-sm text-gh-fg-muted text-center">no chats yet</div>
            }>
              <div class="m-2 space-y-1">
                <For each={chats()}>
                {(chat) => (
                  <button
                    class={`ui-row w-full text-left text-sm group flex items-center gap-2 min-w-0 ${
                      chat.id === props.activeChatId
                        ? "ui-row-active text-gh-fg"
                        : "text-gh-fg-muted"
                    }`}
                    onClick={() => selectChat(chat.id)}
                  >
                    <span class="truncate flex-1 min-w-0">{chat.title || "new chat"}</span>
                    <span
                      class="i ti ti-x text-gh-fg-subtle hover:text-gh-danger opacity-0 group-hover:opacity-100 shrink-0 text-xs"
                      onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                    />
                  </button>
                )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </dialog>
    </>
  );
};
