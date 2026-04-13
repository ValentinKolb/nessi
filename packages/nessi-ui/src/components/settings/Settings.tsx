import { createSignal, Match, Show, Switch } from "solid-js";
import { ProvidersConfig } from "./ProvidersConfig.js";
import { ApiKeys } from "./ApiKeys.js";
import { SystemPrompt } from "./SystemPrompt.js";
import { MemoryEditor } from "./MemoryEditor.js";
import { SkillsConfig } from "./SkillsConfig.js";
import { CompactionSettings } from "./CompactionSettings.js";
import { BackgroundLogsView, BackgroundTasks } from "./BackgroundTasks.js";
import { BackgroundPromptEditor } from "./BackgroundPromptEditor.js";
import type { SkillEntry } from "../../lib/skill-registry.js";
import type { Prompt } from "../../lib/prompts.js";
import { SkillEditorView } from "./SkillEditorModal.js";
import { PromptEditorView } from "./PromptEditorModal.js";
import { GitHubHelpView } from "./GitHubHelpView.js";
import { NextcloudHelpView } from "./NextcloudHelpView.js";

type SettingsRoute =
  | { kind: "root" }
  | { kind: "skill-editor"; skill: SkillEntry | null }
  | { kind: "prompt-editor"; prompt: Prompt | null }
  | { kind: "github-help" }
  | { kind: "nextcloud-help" }
  | { kind: "bg-prompt-editor" }
  | { kind: "bg-logs" };

/** Settings dialog that hosts all runtime configuration panels. */
export const Settings = (props: { ref: (el: HTMLDialogElement) => void; onClose: () => void }) => {
  let dialogRef!: HTMLDialogElement;
  const [route, setRoute] = createSignal<SettingsRoute>({ kind: "root" });

  const close = () => {
    dialogRef.close();
    setRoute({ kind: "root" });
    props.onClose();
  };

  const backToRoot = () => {
    setRoute({ kind: "root" });
  };

  const title = () => {
    const current = route();
    switch (current.kind) {
      case "skill-editor":
        return current.skill ? "Edit Skill" : "New Skill";
      case "prompt-editor":
        return current.prompt ? "Edit Prompt" : "New Prompt";
      case "github-help":
        return "GitHub Token Setup";
      case "nextcloud-help":
        return "Nextcloud App Password Setup";
      case "bg-prompt-editor":
        return "Background Prompts";
      case "bg-logs":
        return "Background Logs";
      default:
        return "Settings";
    }
  };

  const currentSkill = () => {
    const current = route();
    return current.kind === "skill-editor" ? current.skill : null;
  };

  const currentPrompt = () => {
    const current = route();
    return current.kind === "prompt-editor" ? current.prompt : null;
  };

  return (
    <dialog
      ref={(el) => { dialogRef = el; props.ref(el); }}
      class="m-auto bg-gh-surface text-gh-fg p-0 w-[min(980px,96vw)] max-h-[92vh] overflow-hidden shadow-lg"
      onClick={(e) => { if (e.target === dialogRef && route().kind === "root") close(); }}
      onCancel={(e) => {
        if (route().kind !== "root") {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        close();
      }}
    >
      <div class="flex max-h-[92vh] min-h-0 flex-col">
        <div class="flex items-center gap-2 px-4 py-3 bg-gh-overlay rounded-t-md">
          <Show when={route().kind !== "root"}>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={backToRoot}
              title="Back"
            >
              <span class="i ti ti-arrow-left text-base" />
            </button>
          </Show>
          <h2 class="text-[15px] font-semibold text-gh-fg flex-1">{title()}</h2>
          <Show when={route().kind === "root"}>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={close}
              title="Close"
            >
              <span class="i ti ti-x text-base" />
            </button>
          </Show>
        </div>
        <Switch>
          <Match when={route().kind === "root"}>
            <div class="hide-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
              <ProvidersConfig />
              <ApiKeys
                onShowGitHubHelp={() => setRoute({ kind: "github-help" })}
                onShowNextcloudHelp={() => setRoute({ kind: "nextcloud-help" })}
              />
              <SkillsConfig
                onCreateSkill={() => setRoute({ kind: "skill-editor", skill: null })}
                onEditSkill={(skill) => setRoute({ kind: "skill-editor", skill })}
              />
              <SystemPrompt
                onCreatePrompt={() => setRoute({ kind: "prompt-editor", prompt: null })}
                onEditPrompt={(prompt) => setRoute({ kind: "prompt-editor", prompt })}
              />
              <CompactionSettings />
              <BackgroundTasks
                onEditPrompts={() => setRoute({ kind: "bg-prompt-editor" })}
                onOpenLogs={() => setRoute({ kind: "bg-logs" })}
              />
              <MemoryEditor />
            </div>
          </Match>
          <Match when={route().kind === "skill-editor"}>
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
              <SkillEditorView
                skill={currentSkill()}
                onCancel={backToRoot}
                onDone={backToRoot}
              />
            </div>
          </Match>
          <Match when={route().kind === "prompt-editor"}>
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
              <PromptEditorView
                prompt={currentPrompt()}
                onCancel={backToRoot}
                onDone={backToRoot}
              />
            </div>
          </Match>
          <Match when={route().kind === "bg-prompt-editor"}>
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
              <BackgroundPromptEditor onDone={backToRoot} />
            </div>
          </Match>
          <Match when={route().kind === "bg-logs"}>
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
              <BackgroundLogsView />
            </div>
          </Match>
          <Match when={route().kind === "github-help"}>
            <GitHubHelpView />
          </Match>
          <Match when={route().kind === "nextcloud-help"}>
            <NextcloudHelpView />
          </Match>
        </Switch>
      </div>
    </dialog>
  );
};
