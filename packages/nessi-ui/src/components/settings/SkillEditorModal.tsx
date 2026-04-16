import { createEffect, createSignal, For, Show } from "solid-js";
import type { SkillEntry } from "../../lib/skill-registry.js";
import type { SkillReference } from "../../lib/skill-registry.js";
import { ensureUniqueSkillId, listSkills, saveSkills } from "../../lib/skill-registry.js";
import { createSkillDocTemplate, readSkillDocMeta, syncSkillDoc } from "../../lib/skill-doc.js";
import { SNIPPET_TEMPLATE } from "../../lib/skill-templates.js";
import { createCopyAction } from "../../lib/clipboard.js";
import { haptics } from "../../shared/browser/haptics.js";

/* ── Virtual file system model ── */

type VFile =
  | { kind: "skill-md" }
  | { kind: "code"; name: string }
  | { kind: "reference"; index: number; name: string }
  | { kind: "howto" };

const vfileKey = (f: VFile) => {
  if (f.kind === "skill-md") return "SKILL.md";
  if (f.kind === "code") return `code/${f.name}`;
  if (f.kind === "reference") return `references/${f.name || `untitled-${f.index}`}`;
  return "howto";
};

type SkillEditorDraft = {
  id: string;
  name: string;
  doc: string;
  code: string;
  references: SkillReference[];
  builtin?: boolean;
};

const toDraft = (skill: SkillEntry | null): SkillEditorDraft => {
  if (!skill) {
    return { id: "", name: "my-skill", doc: createSkillDocTemplate(), code: SNIPPET_TEMPLATE, references: [], builtin: false };
  }
  return {
    id: skill.id, name: skill.name, doc: skill.doc, code: skill.code ?? "",
    references: skill.references ? skill.references.map((r) => ({ ...r })) : [], builtin: skill.builtin,
  };
};

/* ── How-to content ── */

const HowToContent = () => (
  <div class="h-full overflow-y-auto hide-scrollbar space-y-4 text-[12px] text-gh-fg-muted leading-relaxed p-1">
    <div class="space-y-1.5">
      <h3 class="text-[13px] font-semibold text-gh-fg">What are skills?</h3>
      <p>
        Skills are a lightweight way to extend what your AI agent can do. A skill is a self-contained package of{" "}
        <strong>instructions</strong>, optional <strong>code</strong>, and <strong>reference files</strong> that teach
        the agent how to handle a specific domain. They follow the open{" "}
        <a href="https://agentskills.io/what-are-skills" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">Agent Skills</a>{" "}
        format.
      </p>
    </div>

    <div class="space-y-1.5">
      <h3 class="text-[13px] font-semibold text-gh-fg">Why skills over built-in tools?</h3>
      <p>
        Built-in tools are generic primitives. Skills build on top of them to provide <strong>domain-specific
        knowledge</strong> — your conventions, edge cases, and preferred workflows.
      </p>
      <div class="ml-2 space-y-0.5 text-[11px]">
        <div class="flex items-start gap-1.5"><span class="i ti ti-check text-status-ok-fg text-xs mt-0.5 shrink-0" /> Editable — skills are just text you can tweak anytime</div>
        <div class="flex items-start gap-1.5"><span class="i ti ti-check text-status-ok-fg text-xs mt-0.5 shrink-0" /> Progressive disclosure — only name and description load at startup</div>
        <div class="flex items-start gap-1.5"><span class="i ti ti-check text-status-ok-fg text-xs mt-0.5 shrink-0" /> Portable — export as JSON, share, or import from the community</div>
        <div class="flex items-start gap-1.5"><span class="i ti ti-check text-status-ok-fg text-xs mt-0.5 shrink-0" /> No server needed — everything runs in the browser</div>
      </div>
    </div>

    <div class="space-y-1.5">
      <h3 class="text-[13px] font-semibold text-gh-fg">The virtual bash console</h3>
      <p>
        Since nessi runs entirely in the browser, there's no real shell. Instead it uses{" "}
        <a href="https://github.com/nichochar/just-bash" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">just-bash</a>,
        a TypeScript reimplementation of bash with an in-memory filesystem. Skills with code register as{" "}
        <strong>custom bash commands</strong>. All skill files are mounted at{" "}
        <code class="bg-gh-overlay px-1 rounded">/skills/{"{id}"}/</code>.
      </p>
    </div>

    <div class="space-y-1.5">
      <h3 class="text-[13px] font-semibold text-gh-fg">Skill file structure</h3>
      <div class="ml-2 space-y-1 text-[11px]">
        <div><strong class="text-gh-fg-secondary">SKILL.md</strong> — Required. YAML frontmatter with <code class="bg-gh-overlay px-1 rounded">name</code>, <code class="bg-gh-overlay px-1 rounded">description</code>, and markdown instructions.</div>
        <div><strong class="text-gh-fg-secondary">metadata.nessi</strong> — nessi-specific frontmatter: <code class="bg-gh-overlay px-1 rounded">command</code> (the bash command name) and <code class="bg-gh-overlay px-1 rounded">enabled</code> (whether the skill is active).</div>
        <div><strong class="text-gh-fg-secondary">code/</strong> — Optional JavaScript that registers a bash command via <code class="bg-gh-overlay px-1 rounded">api.defineCommand()</code> or <code class="bg-gh-overlay px-1 rounded">api.cli()</code>. Leave empty for docs-only skills.</div>
        <div><strong class="text-gh-fg-secondary">references/</strong> — Optional files for examples, schemas, or context the agent can read on demand. Mention them in your SKILL.md so the agent knows when to load them (e.g. <em>"Read references/api-errors.md if the API returns an error"</em>).</div>
      </div>
    </div>

    <div class="space-y-1.5">
      <h3 class="text-[13px] font-semibold text-gh-fg">Tips for good skills</h3>
      <div class="ml-2 space-y-0.5 text-[11px]">
        <div class="flex items-start gap-1.5"><span class="text-gh-fg-subtle shrink-0">1.</span> Write the <strong>description</strong> as a trigger — include <em>when</em> to use the skill</div>
        <div class="flex items-start gap-1.5"><span class="text-gh-fg-subtle shrink-0">2.</span> Focus on what the agent <em>wouldn't know</em> without your skill</div>
        <div class="flex items-start gap-1.5"><span class="text-gh-fg-subtle shrink-0">3.</span> Keep SKILL.md concise (&lt; 500 lines) — move details to reference files</div>
        <div class="flex items-start gap-1.5"><span class="text-gh-fg-subtle shrink-0">4.</span> Provide defaults, not menus — pick one approach, mention alternatives briefly</div>
        <div class="flex items-start gap-1.5"><span class="text-gh-fg-subtle shrink-0">5.</span> Add a "gotchas" section for non-obvious facts that prevent mistakes</div>
        <div class="flex items-start gap-1.5"><span class="text-gh-fg-subtle shrink-0">6.</span> Iterate — run it, observe, update</div>
      </div>
    </div>

    <div class="ui-note text-[11px]">
      Learn more at{" "}
      <a href="https://agentskills.io/specification" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">agentskills.io</a>
      {" "}·{" "}
      <a href="https://github.com/nichochar/just-bash" target="_blank" rel="noopener noreferrer" class="underline underline-offset-2 hover:text-gh-fg">just-bash</a>
    </div>
  </div>
);

/* ── Main component ── */

export const SkillEditorView = (props: {
  skill: SkillEntry | null;
  onCancel: () => void;
  onDone: () => void;
}) => {
  const [draft, setDraft] = createSignal<SkillEditorDraft>(toDraft(props.skill));
  const [activeFile, setActiveFile] = createSignal<VFile>({ kind: "skill-md" });
  const [renamingRef, setRenamingRef] = createSignal<number | null>(null);
  const [error, setError] = createSignal("");
  const { copy: copyExport, copied: exportCopied } = createCopyAction();

  createEffect(() => {
    setDraft(toDraft(props.skill));
    setActiveFile({ kind: "skill-md" });
    setRenamingRef(null);
    setError("");
  });

  const isExisting = () => Boolean(draft().id);
  const isActive = (f: VFile) => vfileKey(f) === vfileKey(activeFile());
  const hasCode = () => Boolean(draft().code.trim());

  /* ── Draft mutations ── */

  const setDoc = (value: string) => { setDraft((p) => ({ ...p, doc: value })); if (error()) setError(""); };
  const setCode = (value: string) => { setDraft((p) => ({ ...p, code: value })); };
  const setName = (value: string) => { setDraft((p) => ({ ...p, name: value })); if (error()) setError(""); };

  const setRefContent = (i: number, content: string) => {
    setDraft((p) => ({ ...p, references: p.references.map((r, j) => j === i ? { ...r, content } : r) }));
  };
  const setRefName = (i: number, name: string) => {
    setDraft((p) => ({ ...p, references: p.references.map((r, j) => j === i ? { ...r, name } : r) }));
  };

  const addCodeFile = () => {
    haptics.tap();
    setDraft((p) => ({ ...p, code: p.code.trim() || SNIPPET_TEMPLATE }));
    setActiveFile({ kind: "code", name: "skill.js" });
  };

  const removeCodeFile = () => {
    haptics.tap();
    setDraft((p) => ({ ...p, code: "" }));
    setActiveFile({ kind: "skill-md" });
  };

  const addReference = () => {
    haptics.tap();
    const idx = draft().references.length;
    setDraft((p) => ({ ...p, references: [...p.references, { name: "", content: "" }] }));
    setActiveFile({ kind: "reference", index: idx, name: "" });
    setRenamingRef(idx);
  };

  const removeReference = (i: number) => {
    haptics.tap();
    setDraft((p) => ({ ...p, references: p.references.filter((_, j) => j !== i) }));
    const current = activeFile();
    if (current.kind === "reference" && current.index === i) setActiveFile({ kind: "skill-md" });
    else if (current.kind === "reference" && current.index > i)
      setActiveFile({ kind: "reference", index: current.index - 1, name: draft().references[current.index - 1]?.name ?? "" });
  };

  const startRenameRef = (i: number) => {
    haptics.tap();
    setRenamingRef(i);
  };

  const commitRename = () => setRenamingRef(null);

  /* ── Save / Export / Delete ── */

  const save = async () => {
    const current = draft();
    const nextDoc = syncSkillDoc(current.doc, { name: current.name });
    const parsed = readSkillDocMeta(nextDoc);
    if (!parsed) {
      setActiveFile({ kind: "skill-md" });
      setError("Invalid SKILL.md frontmatter: name and description are required.");
      return;
    }
    const existingSkills = await listSkills();
    const id = current.id || ensureUniqueSkillId(parsed.name, existingSkills);
    const refs = current.references.filter((r) => r.name.trim() && r.content.trim());
    const nextSkill: SkillEntry = {
      id, name: parsed.name, description: parsed.description, command: parsed.command,
      enabled: parsed.enabled, doc: nextDoc,
      code: current.code.trim() ? current.code : undefined,
      references: refs.length > 0 ? refs : undefined, builtin: current.builtin,
    };
    const idx = existingSkills.findIndex((s) => s.id === id);
    const next = idx >= 0 ? existingSkills.map((s) => s.id === id ? { ...s, ...nextSkill } : s) : [...existingSkills, nextSkill];
    await saveSkills(next);
    setError("");
    haptics.success();
    props.onDone();
  };

  const remove = async () => {
    const current = draft();
    if (!current.id || current.builtin) return;
    const existingSkills = await listSkills();
    await saveSkills(existingSkills.filter((s) => s.id !== current.id));
    haptics.success();
    props.onDone();
  };

  const exportSkill = () => {
    const current = draft();
    const exported: Record<string, unknown> = { name: current.name, doc: current.doc };
    if (current.code.trim()) exported.code = current.code;
    const refs = current.references.filter((r) => r.name.trim() && r.content.trim());
    if (refs.length > 0) exported.references = refs;
    const parsed = readSkillDocMeta(current.doc);
    if (parsed) { exported.description = parsed.description; exported.command = parsed.command; exported.enabled = parsed.enabled; }
    copyExport(JSON.stringify(exported, null, 2));
  };

  /* ── Sidebar item styles ── */

  const itemBase = "flex items-center gap-1.5 py-[3px] text-[12px] rounded-[4px] transition-colors cursor-pointer select-none";
  const itemActive = "bg-gh-accent-subtle text-gh-fg";
  const itemInactive = "text-gh-fg-muted hover:bg-gh-overlay hover:text-gh-fg";

  /* ── Render ── */

  return (
    <div class="flex h-full min-h-0 flex-col gap-2">
      {/* Skill name */}
      <div class="space-y-1 shrink-0">
        <Show when={error()}>
          <p class="text-[12px] text-gh-danger">{error()}</p>
        </Show>
        <div class="flex items-center gap-2">
          <label class="text-[11px] font-medium uppercase tracking-wide text-gh-fg-muted shrink-0">Skill</label>
          <input
            class="ui-input flex-1"
            value={draft().name}
            onInput={(e) => setName(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* Main area: sidebar + editor */}
      <div class="flex flex-1 min-h-0 gap-0 border border-gh-border-muted rounded-lg overflow-hidden">

        {/* ── Sidebar ── */}
        <div class="w-[168px] shrink-0 border-r border-gh-border-muted bg-gh-overlay/40 py-1.5 px-1.5 overflow-y-auto hide-scrollbar flex flex-col gap-0.5">
          {/* How to */}
          <button
            class={`${itemBase} px-2 ${isActive({ kind: "howto" }) ? itemActive : itemInactive}`}
            onClick={() => { haptics.tap(); setActiveFile({ kind: "howto" }); }}
          >
            <span class="i ti ti-help-circle text-[11px] shrink-0" />
            <span class="truncate">How to</span>
          </button>

          {/* SKILL.md — always present, not deletable */}
          <button
            class={`${itemBase} px-2 ${isActive({ kind: "skill-md" }) ? itemActive : itemInactive}`}
            onClick={() => { haptics.tap(); setActiveFile({ kind: "skill-md" }); }}
          >
            <span class="i ti ti-markdown text-[11px] shrink-0" />
            <span class="truncate">SKILL.md</span>
          </button>

          {/* code/ folder */}
          <div class="mt-1">
            <div class="flex items-center px-2 py-[2px] text-[10px] uppercase tracking-wider text-gh-fg-subtle font-medium">
              <span class="flex-1">code</span>
              <Show when={!hasCode()}>
                <button
                  class="text-gh-fg-subtle hover:text-gh-accent transition-colors"
                  onClick={addCodeFile}
                  title="Add code file"
                >
                  <span class="i ti ti-plus text-[11px]" />
                </button>
              </Show>
            </div>
            <Show when={hasCode()}>
              <div
                class={`group ${itemBase} pl-4 pr-1 ${isActive({ kind: "code", name: "skill.js" }) ? itemActive : itemInactive}`}
                onClick={() => { haptics.tap(); setActiveFile({ kind: "code", name: "skill.js" }); }}
              >
                <span class="i ti ti-brand-javascript text-[11px] shrink-0" />
                <span class="truncate flex-1">skill.js</span>
                <button
                  class="shrink-0 opacity-0 group-hover:opacity-100 text-gh-fg-subtle hover:text-gh-danger transition-all"
                  onClick={(e) => { e.stopPropagation(); removeCodeFile(); }}
                  title="Remove"
                >
                  <span class="i ti ti-trash text-[11px]" />
                </button>
              </div>
            </Show>
          </div>

          {/* references/ folder */}
          <div class="mt-1">
            <div class="flex items-center px-2 py-[2px] text-[10px] uppercase tracking-wider text-gh-fg-subtle font-medium">
              <span class="flex-1">references</span>
              <button
                class="text-gh-fg-subtle hover:text-gh-accent transition-colors"
                onClick={addReference}
                title="Add reference file"
              >
                <span class="i ti ti-plus text-[11px]" />
              </button>
            </div>
            <For each={draft().references}>
              {(ref, i) => (
                <div
                  class={`group ${itemBase} pl-4 pr-1 ${isActive({ kind: "reference", index: i(), name: ref.name }) ? itemActive : itemInactive}`}
                  onClick={() => { haptics.tap(); setActiveFile({ kind: "reference", index: i(), name: ref.name }); }}
                  onDblClick={(e) => { e.stopPropagation(); startRenameRef(i()); }}
                >
                  <span class="i ti ti-file-text text-[11px] shrink-0" />
                  <Show
                    when={renamingRef() === i()}
                    fallback={<span class="truncate flex-1 min-w-0" title="Double-click to rename">{ref.name || <em class="text-gh-fg-subtle">untitled</em>}</span>}
                  >
                    <input
                      ref={(el) => requestAnimationFrame(() => { el.focus(); el.select(); })}
                      class="flex-1 min-w-0 bg-gh-surface text-[12px] outline-none rounded px-0.5 -mx-0.5 ring-1 ring-gh-accent"
                      value={ref.name}
                      onClick={(e) => e.stopPropagation()}
                      onInput={(e) => setRefName(i(), e.currentTarget.value)}
                      onBlur={commitRename}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") commitRename(); }}
                    />
                  </Show>
                  <Show when={renamingRef() !== i()}>
                    <button
                      class="shrink-0 opacity-0 group-hover:opacity-100 text-gh-fg-subtle hover:text-gh-fg transition-all"
                      onClick={(e) => { e.stopPropagation(); startRenameRef(i()); }}
                      title="Rename"
                    >
                      <span class="i ti ti-pencil text-[10px]" />
                    </button>
                  </Show>
                  <button
                    class="shrink-0 opacity-0 group-hover:opacity-100 text-gh-fg-subtle hover:text-gh-danger transition-all"
                    onClick={(e) => { e.stopPropagation(); removeReference(i()); }}
                    title="Remove"
                  >
                    <span class="i ti ti-trash text-[11px]" />
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>

        {/* ── Editor pane ── */}
        <div class="flex-1 min-w-0 flex flex-col">
          <Show when={activeFile().kind === "howto"}>
            <div class="flex-1 min-h-0 overflow-y-auto hide-scrollbar p-3">
              <HowToContent />
            </div>
          </Show>

          <Show when={activeFile().kind === "skill-md"}>
            <textarea
              class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-gh-fg placeholder:text-gh-fg-subtle focus:outline-none hide-scrollbar"
              value={draft().doc}
              onInput={(e) => setDoc(e.currentTarget.value)}
              spellcheck={false}
            />
          </Show>

          <Show when={activeFile().kind === "code"}>
            <textarea
              class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-gh-fg placeholder:text-gh-fg-subtle focus:outline-none hide-scrollbar"
              value={draft().code}
              onInput={(e) => setCode(e.currentTarget.value)}
              placeholder={SNIPPET_TEMPLATE}
              spellcheck={false}
            />
          </Show>

          <Show when={activeFile().kind === "reference"}>
            {(() => {
              const idx = () => (activeFile() as Extract<VFile, { kind: "reference" }>).index;
              const ref = () => draft().references[idx()];
              return (
                <Show when={ref()} fallback={<div class="flex-1 flex items-center justify-center text-[13px] text-gh-fg-subtle">File not found</div>}>
                  <textarea
                    class="flex-1 min-h-0 w-full resize-none bg-transparent p-3 font-mono text-[12.5px] leading-relaxed text-gh-fg placeholder:text-gh-fg-subtle focus:outline-none hide-scrollbar"
                    value={ref()?.content ?? ""}
                    onInput={(e) => setRefContent(idx(), e.currentTarget.value)}
                    placeholder="File content..."
                    spellcheck={false}
                  />
                </Show>
              );
            })()}
          </Show>
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div class="ui-actions shrink-0">
        <div class="ui-actions-left">
          <button class="btn-secondary" onClick={exportSkill}>
            {exportCopied() ? "copied!" : "export"}
          </button>
          <Show when={isExisting() && !draft().builtin}>
            <button class="btn-secondary danger-text" onClick={() => void remove()}>
              delete
            </button>
          </Show>
        </div>
        <div class="ui-actions-right">
          <button class="btn-secondary" onClick={() => { haptics.tap(); props.onCancel(); }}>cancel</button>
          <button class="btn-primary" onClick={() => void save()}>save</button>
        </div>
      </div>
    </div>
  );
};
