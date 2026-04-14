export type DataScope =
  | "prompts"
  | "skills"
  | "memory"
  | "chats"
  | "files"
  | "scheduler"
  | "settings"
  | `chat:${string}`;

export type DataChangeEvent = {
  scope: DataScope;
  id?: string;
};

const EVENT_NAME = "nessi:data-change";
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("nessi-data") : null;

const listeners = new Set<(event: DataChangeEvent) => void>();

const notify = (event: DataChangeEvent) => {
  for (const listener of listeners) listener(event);
};

if (channel) {
  channel.addEventListener("message", (event) => {
    notify(event.data as DataChangeEvent);
  });
}

export const dbEvents = {
  emit(event: DataChangeEvent) {
    notify(event);
    channel?.postMessage(event);
  },

  subscribe(listener: (event: DataChangeEvent) => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
} as const;
