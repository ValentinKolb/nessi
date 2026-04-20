import { createSignal, For, Show, onMount } from "solid-js";
import { skillRegistry, type SkillEntry } from "../../skills/core/index.js";
import { haptics } from "../../shared/browser/haptics.js";
const NATIVE_TOOLS = ["memory", "web", "survey", "card", "analyze_image", "present", "list_files", "read_file", "write_file", "edit_file", "bash"] as const;

export const SkillsConfig = (props: {
  onCreateSkill: () => void;
  onEditSkill: (skill: SkillEntry) => void;
}) => {
  const [skills, setSkills] = createSignal<SkillEntry[]>([]);
  const [importing, setImporting] = createSignal(false);
  const [importText, setImportText] = createSignal("");
  const [error, setError] = createSignal("");

  const refresh = async () => {
    setSkills(await skillRegistry.list());
  };

  onMount(() => {
    void refresh();
  });

  const importSkill = async () => {
    try {
      const parsed = JSON.parse(importText()) as Partial<SkillEntry>;
      if (typeof parsed.name !== "string" || typeof parsed.doc !== "string") {
        throw new Error("Invalid skill: name and doc are required");
      }
      const existing = skillRegistry.snapshot();
      const id = skillRegistry.ensureUniqueId(parsed.name, existing);
      const skill: SkillEntry = {
        id,
        name: parsed.name,
        description: parsed.description ?? "",
        command: parsed.command ?? parsed.name,
        enabled: parsed.enabled ?? true,
        doc: parsed.doc,
        code: parsed.code,
        references: Array.isArray(parsed.references) ? parsed.references : undefined,
        builtin: false,
      };
      await skillRegistry.saveAll([...existing, skill]);
      setError("");
      setImporting(false);
      setImportText("");
      await refresh();
      haptics.success();
    } catch {
      setError("Invalid skill JSON. Must contain at least name and doc.");
      haptics.error();
    }
  };

  return (
    <div class="ui-panel p-3 space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="settings-heading">
          <span class="i ti ti-forklift" />
          <span>Skills</span>
        </h3>
        <div class="flex items-center gap-2">
          <button class="btn-secondary" onClick={() => { haptics.tap(); setImporting((value) => !value); }}>
            {importing() ? "close" : "import"}
          </button>
          <button class="btn-secondary" onClick={() => { haptics.tap(); props.onCreateSkill(); }}>+ add skill</button>
        </div>
      </div>

      <p class="settings-desc">
        Each skill owns its markdown definition and optional code implementation directly.
      </p>

      <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span class="text-gh-fg-subtle">Native tools:</span>
        <For each={NATIVE_TOOLS}>
          {(tool) => (
            <span class="rounded-full bg-status-info-bg px-2 py-0.5 text-status-info-fg">
              {tool}
            </span>
          )}
        </For>
      </div>

      <Show when={importing()}>
        <div class="ui-subpanel p-2 space-y-2">
          <Show when={error()}>
            <p class="text-[12px] text-gh-danger">{error()}</p>
          </Show>
          <textarea
            class="ui-input min-h-24 resize-y font-mono"
            rows={6}
            placeholder="Paste single skill JSON..."
            value={importText()}
            onInput={(e) => { setImportText(e.currentTarget.value); if (error()) setError(""); }}
          />
          <div class="ui-actions-end">
            <button class="btn-secondary" onClick={() => { haptics.tap(); setImporting(false); setError(""); }}>cancel</button>
            <button class="btn-primary" onClick={() => void importSkill()}>import</button>
          </div>
        </div>
      </Show>

      <div class="ui-list">
        <For each={skills()}>
          {(skill) => (
            <div class="ui-row cursor-pointer" onClick={() => { haptics.tap(); props.onEditSkill(skill); }}>
              <div class="flex items-center gap-2 min-w-0">
                <span class="shrink-0 text-gh-fg-secondary">{skill.command}</span>
                <span class="flex-1 min-w-0 truncate text-gh-fg-muted">{skill.description}</span>
                <span class={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${
                  skill.code?.trim() ? "bg-status-info-bg text-status-info-fg" : "bg-gh-overlay text-gh-fg-subtle"
                }`}>{skill.code?.trim() ? "code" : "docs-only"}</span>
                <Show when={skill.enabled}>
                  <span class="shrink-0 rounded-full bg-status-ok-bg px-2 py-0.5 text-[11px] text-status-ok-fg">enabled</span>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
};
