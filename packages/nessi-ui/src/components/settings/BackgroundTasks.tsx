import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { getBackgroundLogs, getRunLog, triggerJob, type JobRunLog } from "../../lib/scheduler.js";
import { formatDateTimeRelative } from "@valentinkolb/stdlib";
import { haptics } from "../../shared/browser/haptics.js";
import { PulseDots } from "../PulseDots.js";

const JOBS = [
  { id: "refresh-metadata", label: "Chat metadata", cron: "every minute" },
  { id: "consolidate-memory", label: "Memory consolidation", cron: "every 2 hours" },
  { id: "suggest-topics", label: "Chat suggestions", cron: "every 30 minutes" },
] as const;

const StatusBadge = (props: { status: JobRunLog["status"] }) => {
  const cls = () => {
    switch (props.status) {
      case "running": return "bg-status-warn-bg text-status-warn-fg";
      case "success": return "bg-status-ok-bg text-status-ok-fg";
      case "error": return "bg-status-err-bg text-status-err-fg";
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

  const latestFor = (jobId: string) =>
    logs().find((run) => run.jobId === jobId);

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-clock-play" />
          <span>Background Tasks</span>
        </h3>
        <button class="btn-secondary" onClick={() => { haptics.tap(); props.onOpenLogs?.(); }}>
          logs
        </button>
      </div>

      <p class="settings-desc">
        Background jobs process chats after conversations to generate metadata, update memories, and suggest topics.
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
                          <span class="shrink-0 rounded-full bg-gh-overlay px-2 py-0.5 text-[11px] text-gh-fg-subtle tabular-nums">
                            {formatDateTimeRelative(run().finishedAt!)}
                          </span>
                        </Show>
                      </>
                    )}
                  </Show>
                  <Show when={!latest()}>
                    <span class="shrink-0 rounded-full bg-gh-overlay px-2 py-0.5 text-[11px] text-gh-fg-subtle">not run yet</span>
                  </Show>
                  <button
                    class="shrink-0 i ti ti-player-play icon-action text-sm"
                    title={`Run ${job.label}`}
                    onClick={() => { haptics.tap(); void triggerJob(job.id); }}
                  />
                </div>
                <div class="text-[11px] mt-0.5">
                  <Show when={latest()?.status === "running"}>
                    <span class="text-gh-fg-subtle flex items-center gap-1.5">working <PulseDots /></span>
                  </Show>
                  <Show when={latest()?.status !== "running" && latest()?.result}>
                    <span class="text-gh-fg-subtle">{latest()!.result}</span>
                  </Show>
                  <Show when={latest()?.status !== "running" && latest()?.error}>
                    <span class="text-gh-danger">{latest()!.error}</span>
                  </Show>
                </div>
              </div>
            );
          }}
        </For>
      </div>

      <Show when={props.onEditPrompts}>
        <button class="btn-minimal" onClick={() => { haptics.tap(); props.onEditPrompts?.(); }}>
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
