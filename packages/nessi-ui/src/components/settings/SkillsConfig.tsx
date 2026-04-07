import { createSignal, For, onMount } from "solid-js";
import { createCopyAction } from "../../lib/clipboard.js";
import {
  loadSkills,
  saveSkills,
  type SkillEntry,
} from "../../lib/skill-registry.js";
const inputClass = "ui-input";

export function SkillsConfig(props: {
  onCreateSkill: () => void;
  onEditSkill: (skill: SkillEntry) => void;
}) {
  const [skills, setSkills] = createSignal<SkillEntry[]>([]);
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const { copy, copied } = createCopyAction();

  function refresh() {
    setSkills(loadSkills());
  }

  onMount(refresh);

  function exportBundle() {
    copy(JSON.stringify({ version: 2, skills: skills() }, null, 2));
  }

  function importBundle() {
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
  }

  return (
    <div class="ui-panel p-3 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-bold uppercase tracking-wider text-gh-fg-muted">Skills</h3>
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

      {importing() && (
        <div class="ui-subpanel p-2 space-y-2">
          <textarea
            class={`${inputClass} min-h-24 resize-y font-mono`}
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
      )}

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
}
