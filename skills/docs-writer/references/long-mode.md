# Long Mode: comprehensive without being shallow

This file fixes the most distinctive failure: when asked to make documentation *thorough* or *complete*, the writer produces something *longer* that still covers only a few things — going deep on three points and silently dropping the other twelve. **Length is not coverage.** A comprehensive doc is defined by breadth of what it addresses, then depth — in that order.

Use this mode when the user asks for something comprehensive, complete, thorough, exhaustive, full, or explicitly long. It runs *in addition to* the normal workflow, not instead of it.

## The method

1. Outline first (breadth)
2. Fill breadth before depth
3. Width-not-depth check
4. Reader test (optional)

---

## Step 1 — Outline first

Before writing prose, produce a numbered outline that names every topic the doc-type requires (checklists below). This forces breadth to the surface where gaps are visible, instead of discovering at the end that two-thirds of the surface went uncovered.

For a large doc, show the outline to the user before writing the prose. It's far cheaper to fix a missing section in an outline than after 3,000 words.

The outline is also the orientation device (the TOC from `structure.md`) — design it to be both.

---

## Step 2 — Fill breadth before depth

Write a first pass that *touches every outline item*, even briefly. Only then go back and deepen. A reference that lists all 40 options with one line each is more useful than one that explains 5 options across three paragraphs and omits 35. The reader can't act on what isn't there; they can always ask for more on what is.

---

## Step 3 — Width-not-depth check

Before any polishing, count: how many of the doc-type's required topics does the draft actually cover? Under ~80%? Expand to cover them *before* you refine wording. Polishing a doc that's missing a third of its surface is rearranging furniture in a house with no roof.

---

## Step 4 — Reader test (optional; pages > ~800 words or critical help)

Modeled on Anthropic's doc-coauthoring approach. Only if subagents/independent agents are available in the current harness (Claude Code, Cowork); skip silently if not.

1. Generate 5–10 questions a realistic Step-1 reader would arrive with or hit partway through.
2. Hand a fresh agent *only the document* (no surrounding context) and ask it each question.
3. Note every question the document can't answer.
4. Fill those gaps. They're the real coverage holes — the ones the checklist can't anticipate because they're specific to this doc.

If subagents aren't available, do a lighter version yourself: list the reader's likely questions, then check honestly whether the doc answers each.

---

## Per-type coverage checklists

The required surface for each Diátaxis type. "Comprehensive" means covering the relevant rows, not writing more about fewer.

### Tutorial — comprehensive
- [ ] What the reader will have built, stated up front
- [ ] Prerequisites (versions, accounts, prior knowledge)
- [ ] Environment setup, start to finish
- [ ] Every step, in order, each command shown
- [ ] Expected output after each meaningful step
- [ ] Recovery for the common ways a step fails
- [ ] "What you just did" recap
- [ ] One clear next step / where to go from here

### How-to — comprehensive
- [ ] The goal, stated as a task
- [ ] Prerequisites and assumptions
- [ ] Every step to achieve it
- [ ] Each realistic decision branch (OS, version, config variant)
- [ ] How to verify success
- [ ] Common variations on the task
- [ ] Troubleshooting for the frequent failure modes
- [ ] Links out for adjacent tasks (not inlined)

### Reference — comprehensive (completeness is the whole job)
- [ ] Every endpoint / function / command / option / field — none omitted
- [ ] For each: signature/type, parameters, defaults, return/output
- [ ] For each: constraints, valid ranges, units
- [ ] For each: errors/exceptions it can produce
- [ ] For each: a minimal example
- [ ] Consistent structure across all entries
- [ ] An index or grouped, scannable organization
- [ ] Versioning / deprecation notes where relevant

### Explanation — comprehensive
- [ ] The topic and its scope, up front
- [ ] Context and motivation (the problem it addresses)
- [ ] The mental model — how to think about it
- [ ] Why it's designed this way
- [ ] Alternatives that exist and were considered
- [ ] Trade-offs, honestly stated
- [ ] When *not* to use it / limitations
- [ ] Links to the related how-to and reference

### Full project README — comprehensive
- [ ] One-line definition + key claim
- [ ] Status / maturity if relevant
- [ ] Install
- [ ] Quick Start that produces a visible result
- [ ] The common-case API / features, each with an example
- [ ] Configuration / advanced options
- [ ] Architecture overview (for the curious)
- [ ] Compatibility / requirements / platform support
- [ ] License + acknowledgments
- [ ] Links to fuller docs (don't cram a full reference into the README)

### Help article (end-user) — comprehensive
- [ ] What this article helps you do, in one line
- [ ] When/why you'd need it
- [ ] The main path, step by step
- [ ] Variations and options the user actually encounters
- [ ] What to do when it goes wrong (the top few)
- [ ] Related articles / next steps

---

## Guardrails for Long Mode

- **Long must add, not pad.** Every added section should answer a question the short version couldn't. If a paragraph only restates an existing one at greater length, it's padding — cut it (the redundancy pass still applies).
- **Breadth doesn't excuse vagueness.** Touching every topic briefly still means *concrete* brevity — one precise line per option, not one vague line. The specificity pass still applies to every line.
- **Structure scales with length.** A long doc needs the orientation devices from `structure.md` working hard: a real TOC, clear section openers, the funnel. The longer it is, the more the reader depends on being able to navigate it.
- **Completeness ≠ verbosity.** A complete reference is long because it has many entries, each terse — not because each entry is wordy. Don't confuse the two.
