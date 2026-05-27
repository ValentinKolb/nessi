---
name: docs-writer
description: Writes and edits all forms of documentation and user-facing text — READMEs, API references, developer guides, changelogs, runbooks, help articles, tooltips, info boxes, form-field descriptions, error messages, empty states, onboarding copy, and any explanatory text a human will read. Classifies each section using the Diátaxis framework (tutorial / how-to / reference / explanation) or as UX microcopy, leads with an overview, tunes tone to the actual reader, and runs a redundancy-and-filler edit pass. Has a Long Mode with per-type coverage checklists so comprehensive docs stay comprehensive instead of long-but-shallow. Use this skill whenever the user asks for documentation, a README, a help page, info text, a tooltip, an error message, a description for an input, or any user-facing explanatory text — even when they don't say the word "documentation," and even for short snippets like a single tooltip or one paragraph of help.
---

# docs-writer

A skill for writing documentation and user-facing text that is oriented (overview first), right-sized (no filler, no padding), correctly pitched (tone matches the reader), and — when long — actually comprehensive rather than long-and-shallow.

It covers two families of output:

- **Technical docs**: READMEs, API/SDK references, developer guides, ADRs, runbooks, changelogs.
- **End-user microcopy**: tooltips, info boxes, form-field descriptions, error/empty/success states, onboarding text, help-page paragraphs.

The same core problems show up in both: duplication, vague-but-trivial detail, no overview, filler, wrong register, and the long-but-shallow failure. This skill fixes those in a fixed order. Don't skip steps; the order is what prevents the failures.

## The core idea

Most bad documentation fails because the writer started typing before deciding **who reads it, what type of section it is, and what the reader needs first**. The fixes below front-load those decisions, then write, then cut. Writing and cutting are separate passes on purpose — trying to write lean on the first pass produces vague hedging instead of concision.

## Workflow

Follow these steps in order. Steps 0–2 are fast (a few lines of thinking, not output). Steps 3–5 produce and refine the actual text.

### Step 0 — Pick the mode

| Mode | Use when | Reference |
|---|---|---|
| **technical** | README, API/SDK docs, dev guide, ADR, runbook, changelog | `references/structure.md` (incl. README house style) |
| **microcopy** | tooltip, info box, form-field text, error/empty/success state, onboarding, short help paragraph | `references/microcopy.md` |
| **long-form** | the user explicitly wants something *comprehensive*, *complete*, *thorough*, or *long* | `references/long-mode.md` (in addition to the above) |

A single document can mix modes (a README with a tooltip-like CLI flag description). When in doubt, classify per *section*, not per document.

### Step 1 — Name the audience (mandatory, ~2 lines, not shown in output)

Before writing anything, write a short internal note fixing the reader. This is the single highest-leverage step and the one most often skipped:

```
Audience: <who they are>
Knows already: <what you can assume>
Wants to: <the task they came to do>
Reading level / register: <target>
```

Every later decision — which jargon is fine, how much to explain, how short to go — follows from this. If the user hasn't told you the audience and it isn't obvious from context, ask one quick question rather than guessing. See `references/audience.md` for tone selectors per reader type, jargon rules, and reading-level targets.

### Step 2 — Classify each section (Diátaxis)

Decide what *kind* of thing each section is. Mixing kinds in one section is the root cause of the "vague + irrelevant detail" problem — a reference paragraph that wanders into rationale, or a tutorial that dumps a config table.

- **Tutorial** — learning-oriented. A guided lesson that gets a beginner to a first success. Opens with what they'll have built by the end.
- **How-to** — task-oriented. Steps to achieve a specific goal, assuming some competence. Opens with the goal and prerequisites.
- **Reference** — information-oriented. Complete, dry, factual description of an API/options/fields. Opens with one line saying what it catalogs.
- **Explanation** — understanding-oriented. The why, the trade-offs, the mental model. Opens with the topic and scope.
- **Microcopy** — action-oriented, in-product. Helps the user act *right now* at the point of need.

Each type permits a *different* kind of detail. Reference is allowed to be exhaustive; explanation is allowed to digress into rationale; a tutorial must not. Full rules, opener templates, and the common confusions in `references/diataxis.md`.

### Step 3 — Structure before prose (the "overview first" fix)

Write the skeleton before the sentences. Three rules, in priority order:

1. **One-sentence opener.** The first sentence says *what this is, what it's for, and who it's for* — enough that a reader can decide in five seconds whether to keep reading. No throat-clearing ("This document will walk you through…"), no history, no marketing.
2. **Cognitive funnel.** General before specific, common before rare, frequent before edge-case. The reader who stops halfway should still have gotten the important part. This is the inverted-pyramid principle: front-load the conclusion, then support it.
3. **Above-the-fold orientation.** Any document over ~300 words gets a short table of contents or a 3–7 item overview near the top, so the reader sees the shape before the detail.

Inside every section, apply the same funnel: lead with the point, then elaborate. Details, conventions, and the README house style are in `references/structure.md`.

### Step 4 — Write to the budget

Write the content now. Match length to the artifact — these are starting budgets, not hard caps, and the reader's need overrides them:

- Tooltip: ≤ 12 words, one idea.
- Form-field description: one sentence, ≤ 15 words.
- Error message: one sentence on what happened + one on what to do.
- Empty state: ≤ 2 sentences — what's missing + the next action.
- README intro paragraph: ≤ 60 words; must convey what + why + for whom.
- Section heading: ≤ 8 words, sentence case, no trailing punctuation.

Microcopy templates and the reasoning behind each budget are in `references/microcopy.md`.

### Step 5 — Edit pass (always run this)

The draft is the raw material; this pass makes it good. Run these passes **in this order** — re-reading the whole text each time with one job. Doing them separately is what makes each one effective. Full procedure and rationale in `references/editing.md`; concrete word lists in `references/banned-words.md`.

1. **Coverage** *(long-form only)* — does it cover what this doc-type requires? See Step 6.
2. **Redundancy** — say each thing once. One canonical term per concept (don't elegant-variation your way into three names for the same noun). Delete sentences the reader already knows from a sentence above. Merge sections that overlap.
3. **Filler** — cut words that carry no information. Replace wordy phrases with short ones (`utilize → use`, `in order to → to`, `at this point in time → now`). Delete hedges and intensifiers (`very`, `quite`, `simply`, `just`, `basically`) unless they change meaning.
4. **Specificity** — every vague qualifier is either made concrete (give the number, the type, the name) or deleted. Conversely, every hyper-specific detail that no reader decision depends on gets cut or moved to a reference page. The test: *does anyone act differently because this detail is here?* If not, it's noise.
5. **Audience fit** — read it as the Step-1 reader. Too technical? Define or replace the jargon. Too casual for the context? Tighten. Wrong reading level? Shorten sentences. Check for condescension (`obviously`, `of course`, `just`) and bias (`master/slave → primary/replica`, `blacklist/whitelist → blocklist/allowlist`).

Treat word-list hits as *flags to review, not auto-replacements*. "Many clients connect" is fine; the list flags "many" so you check it, not so you delete it reflexively.

### Step 6 — Long mode (only when comprehensive output is requested)

This is the fix for the specific failure where "make it thorough" produces something *longer* that still only covers a few things deeply and omits most of what matters. Length is not coverage. When the user asks for comprehensive/complete/long docs:

1. **Outline first.** Produce a numbered outline covering every topic the doc-type requires (see the per-type checklists in `references/long-mode.md`). Show it to the user before writing prose if the doc is large.
2. **Coverage before depth.** Fill *breadth* first — touch every required topic — then deepen. A comprehensive reference that lists every option briefly beats one that explains three options at length and silently drops the rest.
3. **Width-not-depth check.** Before polishing, count covered topics against the checklist. Under ~80%? Expand before you refine.
4. **Reader test** *(optional; for pages over ~800 words or critical help articles)* — if subagents are available, generate 5–10 questions a real reader would ask, hand the doc (only the doc) to a fresh agent, and note what it can't answer. Fix those gaps. Procedure in `references/long-mode.md`.

## House style (default unless the user says otherwise)

These defaults come from analyzing documentation the user considers good, plus the Google and Microsoft developer style guides. They're defaults, not laws — a user's house style wins.

- Sentence-case headings, no trailing punctuation, no emoji prefixes.
- Second person and imperative for instructions ("Run the server"), present tense, active voice.
- Terse and declarative. State what the thing is and does; skip "we believe" and "powerful, easy-to-use."
- Code examples must be runnable and minimal — import + smallest real usage, not a toy that omits the imports.
- ASCII diagrams over images for architecture; images only where they genuinely beat text (screenshots of a UI, a benchmark plot).
- Tables only for genuinely tabular data; don't table a two-item list.
- For READMEs specifically: one-line definition opener → optional status note → Quick Start as the first real section → feature/API sections → minimal end matter. Detail in `references/structure.md`.

## Anti-patterns (don't produce these)

- Marketing adjectives in technical docs ("blazing-fast", "powerful", "seamless", "robust").
- Emoji-decorated headings, exclamation marks, "Built with ❤️" footers.
- Meta-narration: "In this section we will…", "This guide is designed to…".
- A "Features" section that's a bullet list of adjectives with no substance.
- Synonym churn: calling the same concept three different names across one page.
- Long-but-shallow: padding a doc to feel thorough while omitting most of what the type requires.
- Hedging instead of concision: "it might be the case that you may want to perhaps consider" → "consider".

## Reference files

Read the relevant file when its step or mode activates — don't preload everything.

- `references/diataxis.md` — the four doc types in depth, opener templates, how to tell them apart, hybrid pages.
- `references/structure.md` — inverted pyramid, cognitive funnel, TOC rules, full README house style.
- `references/microcopy.md` — templates and length budgets for every microcopy type; NN/g's 3 I's and 3 C's.
- `references/audience.md` — persona template, tone selectors per reader, reading-level targets, jargon and bias rules.
- `references/editing.md` — the five-pass edit as a repeatable procedure with before/after examples.
- `references/banned-words.md` — filler, weasel, wordiness, condescension, and bias word lists (as review flags).
- `references/long-mode.md` — per-type coverage checklists, outline-first workflow, the reader-test procedure.
