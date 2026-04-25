import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { getBackgroundLogs, getRunLog, triggerJob, type JobRunLog } from "../../domains/scheduler/scheduler.js";
import { settingsRepo } from "../../domains/settings/settings.repo.js";
import { dbEvents } from "../../shared/db/db-events.js";
import { formatDateTimeRelative } from "@valentinkolb/stdlib";
import { haptics } from "../../shared/browser/haptics.js";
import { PulseDots } from "../PulseDots.js";

const JOBS = [
  { id: "refresh-metadata", label: "Chat metadata" },
  { id: "consolidate-memory", label: "Memory consolidation" },
  { id: "suggest-topics", label: "Chat suggestions" },
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
  const [cronConfig, setCronConfig] = createSignal<Record<string, string>>({});
  let timer: ReturnType<typeof setInterval> | undefined;

  const refresh = async () => {
    setLogs(await getRunLog());
  };

  const refreshCron = async () => {
    setCronConfig(await settingsRepo.getCronConfig());
  };

  onMount(() => {
    void refresh();
    void refreshCron();
    timer = setInterval(() => { void refresh(); }, 2000);
    const unsub = dbEvents.subscribe((event) => {
      if (event.scope === "settings") void refreshCron();
    });
    onCleanup(unsub);
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
                  <span class="text-[11px] text-gh-fg-subtle font-mono">{cronConfig()[job.id] ?? ""}</span>
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
    <div class="h-full flex flex-col gap-3">
      <p class="settings-desc shrink-0">
        Persistent background scheduler logs from local storage.
      </p>
      {/*
        flex-col-reverse pins the scroll viewport to the newest entry without
        any JS: scrollTop=0 maps to the visual bottom, so newly appended logs
        stay in view while letting the user scroll up to read older lines.
        Render order is reversed so the newest line is the first DOM child
        (visually rendered at the bottom). flex-1 + min-h-0 lets the panel
        grow to fill the remaining viewport height instead of capping at a
        fixed max-height.
      */}
      <div class="ui-panel p-3 flex-1 min-h-0 overflow-y-auto flex flex-col-reverse">
        <Show
          when={textLogs().length > 0}
          fallback={<span class="font-mono text-[12px] text-gh-fg-muted">No logs yet.</span>}
        >
          <For each={textLogs().slice().reverse()}>
            {(line) => (
              <div class="font-mono whitespace-pre-wrap break-words text-[12px] leading-5 text-gh-fg-muted">
                {line}
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};
