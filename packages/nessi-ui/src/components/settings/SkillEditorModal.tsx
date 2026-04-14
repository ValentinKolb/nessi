import { createEffect, createSignal, Show } from "solid-js";
import type { SkillEntry } from "../../lib/skill-registry.js";
import { ensureUniqueSkillId, listSkills, saveSkills } from "../../lib/skill-registry.js";
import { createSkillDocTemplate, readSkillDocMeta, syncSkillDoc } from "../../lib/skill-doc.js";
import { SNIPPET_TEMPLATE } from "../../lib/skill-templates.js";
import { createCopyAction } from "../../lib/clipboard.js";

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
  const [error, setError] = createSignal("");
  const { copy: copyExport, copied: exportCopied } = createCopyAction();

  createEffect(() => {
    setDraft(toDraft(props.skill));
    setTab("definition");
    setError("");
  });

  const isExisting = () => Boolean(draft().id);
  const panelClass = "flex h-full min-h-0 flex-col gap-3";
  const editorClass = "ui-input hide-scrollbar h-full min-h-0 flex-1 resize-none overflow-y-auto font-mono";

  const save = async () => {
    const current = draft();
    const nextDoc = syncSkillDoc(current.doc, { name: current.name });
    const parsed = readSkillDocMeta(nextDoc);
    if (!parsed) {
      setTab("definition");
      setError("Invalid SKILL.md frontmatter: name and description are required.");
      return;
    }

    const existingSkills = await listSkills();
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

    await saveSkills(next);
    setError("");
    props.onDone();
  };

  const remove = async () => {
    const current = draft();
    if (!current.id || current.builtin) return;
    const existingSkills = await listSkills();
    await saveSkills(existingSkills.filter((skill) => skill.id !== current.id));
    props.onDone();
  };

  const exportSkill = () => {
    const current = draft();
    const exported: Record<string, unknown> = {
      name: current.name,
      doc: current.doc,
    };
    if (current.code.trim()) exported.code = current.code;
    const parsed = readSkillDocMeta(current.doc);
    if (parsed) {
      exported.description = parsed.description;
      exported.command = parsed.command;
      exported.enabled = parsed.enabled;
    }
    copyExport(JSON.stringify(exported, null, 2));
  };

  return (
    <div class="flex h-full min-h-0 flex-col gap-3">
      <div class="space-y-3">
        <Show when={error()}>
          <p class="text-[12px] text-gh-danger">{error()}</p>
        </Show>
        <div class="space-y-1.5">
          <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted">Skill Name</label>
          <input
            class="ui-input"
            value={draft().name}
            onInput={(e) => { setDraft((prev) => ({ ...prev, name: e.currentTarget.value })); if (error()) setError(""); }}
          />
        </div>

        <div class="flex border-b border-gh-border-muted">
          <button
            class={`px-3 py-1.5 text-[13px] font-medium transition-colors relative ${
              tab() === "definition"
                ? "text-gh-fg"
                : "text-gh-fg-subtle hover:text-gh-fg-muted"
            }`}
            onClick={() => setTab("definition")}
          >
            Definition
            <Show when={tab() === "definition"}>
              <span class="absolute bottom-0 left-0 right-0 h-[2px] bg-gh-accent rounded-full" />
            </Show>
          </button>
          <button
            class={`px-3 py-1.5 text-[13px] font-medium transition-colors relative ${
              tab() === "implementation"
                ? "text-gh-fg"
                : "text-gh-fg-subtle hover:text-gh-fg-muted"
            }`}
            onClick={() => setTab("implementation")}
          >
            Code
            <Show when={tab() === "implementation"}>
              <span class="absolute bottom-0 left-0 right-0 h-[2px] bg-gh-accent rounded-full" />
            </Show>
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
              onInput={(e) => { setDraft((prev) => ({ ...prev, doc: e.currentTarget.value })); if (error()) setError(""); }}
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
              onInput={(e) => { setDraft((prev) => ({ ...prev, code: e.currentTarget.value })); if (error()) setError(""); }}
            />
          </div>
        </Show>
      </div>

      <div class="flex items-center gap-2">
        <button class="btn-secondary" onClick={props.onCancel}>cancel</button>
        <button class="btn-primary" onClick={() => void save()}>save</button>
        <div class="flex-1" />
        <button class="btn-secondary" onClick={exportSkill}>
          {exportCopied() ? "copied!" : "export"}
        </button>
        <Show when={isExisting() && !draft().builtin}>
          <button class="btn-secondary danger-text" onClick={() => void remove()}>
            delete
          </button>
        </Show>
      </div>
    </div>
  );
};
