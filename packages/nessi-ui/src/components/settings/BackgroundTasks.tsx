import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { getBackgroundLogs, getRunLog, triggerMetadataRefresh, type JobRunLog } from "../../lib/scheduler.js";
import { timeAgo } from "../../lib/date-format.js";

const JOBS = [
  { id: "refresh-metadata", label: "Chat metadata", cron: "every minute" },
  { id: "consolidate-memory", label: "Memory consolidation", cron: "every 6 hours" },
] as const;

const StatusBadge = (props: { status: JobRunLog["status"] }) => {
  const cls = () => {
    switch (props.status) {
      case "running": return "bg-amber-50 text-amber-700";
      case "success": return "bg-emerald-50 text-emerald-700";
      case "error": return "bg-red-50 text-red-700";
    }
  };
  return (
    <span class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${cls()}`}>
      {props.status}
    </span>
  );
};

export const BackgroundTasks = (props: { onEditPrompts?: () => void; onOpenLogs?: () => void }) => {
  const [logs, setLogs] = createSignal<readonly JobRunLog[]>([]);
  let timer: ReturnType<typeof setInterval> | undefined;

  const refresh = async () => {
    setLogs(await getRunLog());
  };

  onMount(() => {
    void refresh();
    timer = setInterval(() => { void refresh(); }, 2000);
  });

  onCleanup(() => { if (timer) clearInterval(timer); });

  const latestFor = (jobId: string) => {
    const all = logs();
    for (let i = all.length - 1; i >= 0; i--) {
      if (all[i]!.jobId === jobId) return all[i]!;
    }
    return undefined;
  };

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-clock-play" />
          <span>Background Tasks</span>
        </h3>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" onClick={props.onOpenLogs}>
            logs
          </button>
          <button class="btn-secondary" onClick={() => void triggerMetadataRefresh()}>
            run now
          </button>
        </div>
      </div>

      <p class="settings-desc">
        Background jobs process chats after conversations to generate metadata and update memories.
      </p>

      <div class="ui-list">
        <For each={JOBS}>
          {(job) => {
            const latest = () => latestFor(job.id);
            return (
              <div class="ui-row">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="shrink-0 text-gh-fg-secondary">{job.label}</span>
                  <span class="text-[11px] text-gh-fg-subtle">{job.cron}</span>
                  <div class="flex-1" />
                  <Show when={latest()}>
                    {(run) => (
                      <>
                        <StatusBadge status={run().status} />
                        <Show when={run().finishedAt}>
                          <span class="text-[11px] text-gh-fg-subtle tabular-nums">
                            {timeAgo(run().finishedAt!)}
                          </span>
                        </Show>
                      </>
                    )}
                  </Show>
                  <Show when={!latest()}>
                    <span class="text-[11px] text-gh-fg-subtle">not run yet</span>
                  </Show>
                </div>
                <Show when={latest()?.result}>
                  <div class="text-[11px] text-gh-fg-subtle mt-0.5">{latest()!.result}</div>
                </Show>
                <Show when={latest()?.error}>
                  <div class="text-[11px] text-gh-danger mt-0.5">{latest()!.error}</div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={props.onEditPrompts}>
        <button class="btn-minimal" onClick={props.onEditPrompts}>
          edit background prompts
        </button>
      </Show>
    </div>
  );
};

export const BackgroundLogsView = () => {
  const [textLogs, setTextLogs] = createSignal<readonly string[]>([]);
  let timer: ReturnType<typeof setInterval> | undefined;

  const refresh = async () => {
    setTextLogs(await getBackgroundLogs());
  };

  onMount(() => {
    void refresh();
    timer = setInterval(() => { void refresh(); }, 2000);
  });

  onCleanup(() => { if (timer) clearInterval(timer); });

  return (
    <div class="space-y-3">
      <p class="settings-desc">
        Persistent background scheduler logs from local storage.
      </p>
      <div class="ui-panel p-3">
        <pre class="font-mono whitespace-pre-wrap break-words text-[12px] leading-5 text-gh-fg-muted">
          {textLogs().length > 0 ? textLogs().join("\n") : "No logs yet."}
        </pre>
      </div>
    </div>
  );
};
