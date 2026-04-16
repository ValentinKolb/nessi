import { createSignal, Match, Show, Switch } from "solid-js";
import { humanId } from "human-id";
import { ProvidersConfig } from "./ProvidersConfig.js";
import { ProviderEditorView } from "./ProviderEditorView.js";
import { ApiKeys } from "./ApiKeys.js";
import { SystemPrompt } from "./SystemPrompt.js";
import { MemoryEditor } from "./MemoryEditor.js";
import { SkillsConfig } from "./SkillsConfig.js";
import { CompactionSettings } from "./CompactionSettings.js";
import { BackgroundLogsView, BackgroundTasks } from "./BackgroundTasks.js";
import { BackgroundPromptEditor } from "./BackgroundPromptEditor.js";
import { GeneralSettings } from "./GeneralSettings.js";
import type { SkillEntry } from "../../lib/skill-registry.js";
import type { Prompt } from "../../lib/prompts.js";
import {
  loadProviders,
  saveProviders,
  getActiveProviderId,
  setActiveProviderId,
  type ProviderEntry,
} from "../../lib/provider.js";
import { SkillEditorView } from "./SkillEditorModal.js";
import { PromptEditorView } from "./PromptEditorModal.js";
import { CompactionPromptEditor } from "./CompactionPromptEditor.js";
import { GitHubHelpView } from "./GitHubHelpView.js";
import { NextcloudHelpView } from "./NextcloudHelpView.js";
import { haptics } from "../../shared/browser/haptics.js";

type SettingsRoute =
  | { kind: "root" }
  | { kind: "skill-editor"; skill: SkillEntry | null }
  | { kind: "prompt-editor"; prompt: Prompt | null }
  | { kind: "provider-editor"; provider: ProviderEntry | null }
  | { kind: "github-help" }
  | { kind: "nextcloud-help" }
  | { kind: "bg-prompt-editor" }
  | { kind: "bg-logs" }
  | { kind: "compaction-prompt-editor" };

/** Settings dialog that hosts all runtime configuration panels. */
export const Settings = (props: { ref: (el: HTMLDialogElement) => void; onClose: () => void }) => {
  let dialogRef!: HTMLDialogElement;
  const [route, setRoute] = createSignal<SettingsRoute>({ kind: "root" });

  const close = (withHaptics = false) => {
    if (withHaptics) haptics.tap();
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
      case "provider-editor":
        return current.provider ? "Edit Provider" : "New Provider";
      case "github-help":
        return "GitHub Token Setup";
      case "nextcloud-help":
        return "Nextcloud App Password Setup";
      case "bg-prompt-editor":
        return "Background Prompts";
      case "bg-logs":
        return "Background Logs";
      case "compaction-prompt-editor":
        return "Compaction Prompt";
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

  const currentProvider = () => {
    const current = route();
    return current.kind === "provider-editor" ? current.provider : null;
  };

  const isNewProvider = () => {
    const current = route();
    if (current.kind !== "provider-editor") return false;
    if (!current.provider) return true;
    return !loadProviders().some((p) => p.id === current.provider!.id);
  };

  const handleProviderSave = (entry: ProviderEntry) => {
    const list = loadProviders();
    const idx = list.findIndex((p) => p.id === entry.id);
    const updated = idx >= 0
      ? list.map((p) => (p.id === entry.id ? entry : p))
      : [...list, entry];
    saveProviders(updated);
    // Auto-activate if it's the only provider
    if (updated.length === 1 || !getActiveProviderId()) {
      setActiveProviderId(entry.id);
    }
    backToRoot();
  };

  const handleProviderDelete = (id: string) => {
    const filtered = loadProviders().filter((p) => p.id !== id);
    saveProviders(filtered);
    if (getActiveProviderId() === id) {
      const next = filtered[0]?.id;
      if (next) setActiveProviderId(next);
    }
    backToRoot();
  };

  const handleCreateProvider = () => {
    const entry: ProviderEntry = {
      id: humanId({ separator: "-", capitalize: false }),
      type: "openai-compatible",
      name: "",
      baseURL: "http://localhost:11434/v1",
      model: "",
      toolCallIdPolicy: "passthrough",
    };
    setRoute({ kind: "provider-editor", provider: entry });
  };

  return (
    <dialog
      ref={(el) => { dialogRef = el; props.ref(el); }}
      class="modal-dialog w-[min(980px,96vw)] max-h-[92vh]"
      onClick={(e) => { if (e.target === dialogRef && route().kind === "root") close(true); }}
      onCancel={(e) => {
        if (route().kind !== "root") {
          e.preventDefault();
          return;
        }
        e.preventDefault();
        close(true);
      }}
    >
      <div class={`flex max-h-[92vh] min-h-0 flex-col ${route().kind !== "root" ? "h-[92vh]" : ""}`}>
        <div class="flex items-center gap-2 px-4 py-3 bg-gh-overlay rounded-t-md">
          <Show when={route().kind !== "root"}>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={() => { haptics.tap(); backToRoot(); }}
              title="Back"
            >
              <span class="i ti ti-arrow-left text-base" />
            </button>
          </Show>
          <h2 class="text-[15px] font-semibold text-gh-fg flex-1">{title()}</h2>
          <Show when={route().kind === "root"}>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-md nav-icon"
              onClick={() => close(true)}
              title="Close"
            >
              <span class="i ti ti-x text-base" />
            </button>
          </Show>
        </div>
        <Switch>
          <Match when={route().kind === "root"}>
            <div class="hide-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3">
              <GeneralSettings />
              <ProvidersConfig
                onCreateProvider={handleCreateProvider}
                onEditProvider={(provider) => setRoute({ kind: "provider-editor", provider })}
              />
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
              <CompactionSettings onEditPrompt={() => setRoute({ kind: "compaction-prompt-editor" })} />
              <BackgroundTasks
                onEditPrompts={() => setRoute({ kind: "bg-prompt-editor" })}
                onOpenLogs={() => setRoute({ kind: "bg-logs" })}
              />
              <MemoryEditor />
            </div>
          </Match>
          <Match when={route().kind === "provider-editor"}>
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
              <ProviderEditorView
                provider={currentProvider()}
                isNew={isNewProvider()}
                onCancel={backToRoot}
                onSave={handleProviderSave}
                onDelete={handleProviderDelete}
              />
            </div>
          </Match>
          <Match when={route().kind === "skill-editor"}>
            <div class="min-h-0 flex-1 px-4 pb-4 pt-3">
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
          <Match when={route().kind === "compaction-prompt-editor"}>
            <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
              <CompactionPromptEditor onDone={backToRoot} />
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
