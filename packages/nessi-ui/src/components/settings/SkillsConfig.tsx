import { createSignal, For, Show, onMount } from "solid-js";
import { createCopyAction } from "../../lib/clipboard.js";
import {
  loadSkills,
  saveSkills,
  type SkillEntry,
} from "../../lib/skill-registry.js";
const NATIVE_TOOLS = ["memory", "web", "list_files", "read_file", "write_file", "edit_file", "bash"] as const;

export const SkillsConfig = (props: {
  onCreateSkill: () => void;
  onEditSkill: (skill: SkillEntry) => void;
}) => {
  const [skills, setSkills] = createSignal<SkillEntry[]>([]);
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const { copy, copied } = createCopyAction();

  const refresh = () => {
    setSkills(loadSkills());
  };

  onMount(refresh);

  const exportBundle = () => {
    copy(JSON.stringify({ version: 2, skills: skills() }, null, 2));
  };

  const importBundle = () => {
    try {
      const parsed = JSON.parse(importText()) as { skills?: SkillEntry[] };
      if (!Array.isArray(parsed.skills)) {
        throw new Error("Missing skills array");
      }
      setImporting(false);
      setImportText("");
      saveSkills(parsed.skills);
      refresh();
    } catch {
      alert("Invalid skills bundle JSON.");
    }
  };

  return (
    <div class="ui-panel p-3 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gh-fg-muted">
          <span class="i ti ti-forklift text-sm" />
          <span>Skills</span>
        </h3>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" onClick={() => setImporting((value) => !value)}>
            {importing() ? "close import" : "import"}
          </button>
          <button class="btn-secondary" onClick={exportBundle}>
            {copied() ? "copied!" : "export"}
          </button>
          <button class="btn-secondary" onClick={props.onCreateSkill}>+ add skill</button>
        </div>
      </div>

      <p class="text-[10px] leading-tight text-gh-fg-subtle">
        Each skill owns its markdown definition and optional code implementation directly.
      </p>

      <div class="flex flex-wrap items-center gap-1.5 text-[10px]">
        <span class="text-gh-fg-subtle">Native tools:</span>
        <For each={NATIVE_TOOLS}>
          {(tool) => (
            <span class="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700">
              {tool}
            </span>
          )}
        </For>
      </div>

      <Show when={importing()}>
        <div class="ui-subpanel p-2 space-y-2">
          <textarea
            class="ui-input min-h-24 resize-y font-mono"
            rows={6}
            placeholder="Paste skills bundle JSON"
            value={importText()}
            onInput={(e) => setImportText(e.currentTarget.value)}
          />
          <div class="flex gap-2">
            <button class="btn-secondary" onClick={() => setImporting(false)}>cancel</button>
            <button class="btn-primary" onClick={importBundle}>import</button>
          </div>
        </div>
      </Show>

      <div class="ui-list">
        <For each={skills()}>
          {(skill) => (
            <div class="ui-row cursor-pointer" onClick={() => props.onEditSkill(skill)}>
              <div class="flex items-center gap-2 min-w-0">
                <span class="shrink-0 text-gh-fg-secondary">{skill.command}</span>
                <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{skill.description}</span>
                <span class="shrink-0 text-[10px] text-gh-fg-subtle">{skill.code?.trim() ? "code" : "docs-only"}</span>
                <span class="shrink-0 text-[10px] text-gh-fg-subtle">{skill.enabled ? "enabled" : "disabled"}</span>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
