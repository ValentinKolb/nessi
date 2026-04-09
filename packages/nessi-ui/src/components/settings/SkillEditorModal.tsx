import { createEffect, createSignal, Show } from "solid-js";
import type { SkillEntry } from "../../lib/skill-registry.js";
import { ensureUniqueSkillId, loadSkills, saveSkills } from "../../lib/skill-registry.js";
import { createSkillDocTemplate, readSkillDocMeta, syncSkillDoc } from "../../lib/skill-doc.js";
import { SNIPPET_TEMPLATE } from "../../lib/skill-templates.js";

type SkillEditorDraft = {
  id: string;
  name: string;
  doc: string;
  code: string;
  builtin?: boolean;
};

const toDraft = (skill: SkillEntry | null): SkillEditorDraft => {
  if (!skill) {
    return {
      id: "",
      name: "my-skill",
      doc: createSkillDocTemplate(),
      code: SNIPPET_TEMPLATE,
      builtin: false,
    };
  }

  return {
    id: skill.id,
    name: skill.name,
    doc: skill.doc,
    code: skill.code ?? "",
    builtin: skill.builtin,
  };
};

export const SkillEditorView = (props: {
  skill: SkillEntry | null;
  onCancel: () => void;
  onDone: () => void;
}) => {
  const [draft, setDraft] = createSignal<SkillEditorDraft>(toDraft(props.skill));
  const [tab, setTab] = createSignal<"definition" | "implementation">("definition");

  createEffect(() => {
    setDraft(toDraft(props.skill));
    setTab("definition");
  });

  const isExisting = () => Boolean(draft().id);
  const panelClass = "flex h-full min-h-0 flex-col gap-2";
  const editorClass = "ui-input hide-scrollbar h-full min-h-0 flex-1 resize-none overflow-y-auto font-mono";

  const save = () => {
    const current = draft();
    const nextDoc = syncSkillDoc(current.doc, { name: current.name });
    const parsed = readSkillDocMeta(nextDoc);
    if (!parsed) {
      setTab("definition");
      alert("Invalid SKILL.md frontmatter: name and description are required.");
      return;
    }

    const existingSkills = loadSkills();
    const id = current.id || ensureUniqueSkillId(parsed.name, existingSkills);
    const nextSkill: SkillEntry = {
      id,
      name: parsed.name,
      description: parsed.description,
      command: parsed.command,
      enabled: parsed.enabled,
      doc: nextDoc,
      code: current.code.trim() ? current.code : undefined,
      builtin: current.builtin,
    };

    const idx = existingSkills.findIndex((skill) => skill.id === id);
    const next = idx >= 0
      ? existingSkills.map((skill) => (skill.id === id ? { ...skill, ...nextSkill } : skill))
      : [...existingSkills, nextSkill];

    saveSkills(next);
    props.onDone();
  };

  const remove = () => {
    const current = draft();
    if (!current.id || current.builtin) return;
    saveSkills(loadSkills().filter((skill) => skill.id !== current.id));
    props.onDone();
  };

  return (
    <div class="flex h-full min-h-0 flex-col gap-4">
      <div class="space-y-4">
        <div class="space-y-1">
          <label class="text-[10px] font-bold uppercase tracking-wider text-gh-fg-muted">Skill Name</label>
          <input
            class="ui-input"
            value={draft().name}
            onInput={(e) => setDraft((prev) => ({ ...prev, name: e.currentTarget.value }))}
          />
        </div>

        <div class="flex gap-2">
          <button
            class={tab() === "definition" ? "btn-primary" : "btn-secondary"}
            onClick={() => setTab("definition")}
          >
            skill definition
          </button>
          <button
            class={tab() === "implementation" ? "btn-primary" : "btn-secondary"}
            onClick={() => setTab("implementation")}
          >
            code impl
          </button>
        </div>
      </div>

      <div class="min-h-0 flex-1">
        <Show when={tab() === "definition"}>
          <div class={panelClass}>
            <div class="ui-note ui-note-editor shrink-0">
              Keep the markdown self-contained. Include YAML frontmatter with at least <code>name</code> and
              <code> description</code>. <code>metadata.nessi.enabled</code> also lives there and is saved from the
              frontmatter.
            </div>
            <textarea
              class={editorClass}
              rows={20}
              value={draft().doc}
              onInput={(e) => setDraft((prev) => ({ ...prev, doc: e.currentTarget.value }))}
            />
          </div>
        </Show>

        <Show when={tab() === "implementation"}>
          <div class={panelClass}>
            <div class="ui-note ui-note-editor shrink-0">
              Optional. Leave this empty for a docs-only skill. Use <code>api.defineCommand(...)</code> for a single
              command or <code>api.cli(...)</code> for subcommands. Snippets run in the browser and can use
              <code> fetch</code> plus <code>api.helpers</code> for approvals or surveys.
            </div>
            <textarea
              class={editorClass}
              rows={20}
              placeholder={SNIPPET_TEMPLATE}
              value={draft().code}
              onInput={(e) => setDraft((prev) => ({ ...prev, code: e.currentTarget.value }))}
            />
          </div>
        </Show>
      </div>

      <div class="flex items-center gap-2 pt-2">
        <button class="btn-secondary" onClick={props.onCancel}>cancel</button>
        <button class="btn-primary" onClick={save}>save</button>
        <div class="flex-1" />
        <Show when={isExisting() && !draft().builtin}>
          <button class="btn-secondary danger-text" onClick={remove}>
            delete
          </button>
        </Show>
      </div>
    </div>
  );
};
