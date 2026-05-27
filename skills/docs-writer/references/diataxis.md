# Diátaxis: the four documentation types

Diátaxis (by Daniele Procida) is the spine of this skill. It says technical documentation serves four distinct needs, and that **most documentation is bad because it tries to serve more than one need in one place.** A tutorial that keeps stopping to explain theory loses the beginner; a reference that wanders into rationale becomes unsearchable. Classify each *section* by type, then write only what that type allows.

The two axes:

```
                 PRACTICAL                 THEORETICAL
              (doing / steps)          (knowing / cognition)

 STUDY     ┌──────────────────────┬──────────────────────┐
 (learning)│      TUTORIAL        │     EXPLANATION       │
           │  learning-oriented   │ understanding-oriented│
           ├──────────────────────┼──────────────────────┤
 WORK      │       HOW-TO         │      REFERENCE        │
 (applying)│   task-oriented      │ information-oriented  │
           └──────────────────────┴──────────────────────┘
```

Plus a fifth, in-product type this skill adds: **microcopy** (action-oriented, at the point of need). See `microcopy.md`.

---

## Tutorial — learning-oriented

A lesson. The reader is a beginner who learns by doing under your guidance. Success is measured by whether they reach a working result and feel capable, not by whether they understand every detail.

**Allowed content:** concrete steps that work, in order; the minimum needed to succeed; reassurance about what they're seeing.

**Forbidden content:** options, alternatives, edge cases, "you could also…", deep rationale, exhaustive parameter lists. These belong in how-to, explanation, and reference. A tutorial that branches has failed.

**Opener template:** "By the end of this tutorial you'll have *<concrete artifact>*. You need *<minimal prerequisites>*."

**Rules:**
- Every command must run and produce the output you claim. Show the expected output.
- Make choices *for* the reader — pick one path and walk it. Don't say "you can use X or Y."
- Use concrete, real names, not `<your-value-here>` placeholders where avoidable.
- End with "what you just did" and a single pointer to the next step.

---

## How-to — task-oriented

A recipe for a competent user with a specific goal. Assumes they know the basics; they're here to get one job done.

**Allowed content:** the goal, prerequisites, the steps, decision branches that matter ("if you're on Windows…"), verification, common variations, troubleshooting.

**Forbidden content:** teaching from scratch (that's a tutorial), full theory (that's explanation), complete option enumeration (that's reference).

**Opener template:** "This guide shows you how to *<goal>*. It assumes *<prerequisite competence>*."

**Rules:**
- Title it as a task, starting with a verb: "Deploy to production", "Rotate the signing key".
- Steps are imperative and sequential. Number them.
- State the success condition: how the reader knows it worked.
- Cover the realistic branches; link out for the rest rather than inlining everything.

---

## Reference — information-oriented

The map. Dry, complete, accurate description of how the machinery is. The reader knows what they're looking for and wants to find it fast and trust it.

**Allowed content:** complete enumeration — every endpoint, option, field, flag — each with type, default, constraints, errors, and a minimal example. Consistent structure across entries.

**Forbidden content:** rationale, persuasion, tutorials, opinions, "we recommend" (mostly). Reference describes; it doesn't teach or argue.

**Opener template:** "This page documents *<the surface>*." One line. Then the entries.

**Rules:**
- Structure mirrors the code's structure. Group logically; make it scannable and ideally indexed/alphabetized.
- Be consistent: if one entry lists Type / Default / Description, all do.
- Completeness is the whole point. A reference that covers "the important options" is broken. This is where Long Mode's coverage checklist matters most.
- Examples are minimal and illustrative, not narrative.

---

## Explanation — understanding-oriented

The discussion. Background, context, the why, the trade-offs, the design decisions. Read away from the keyboard. This is the *only* type allowed to digress into rationale and history.

**Allowed content:** context and motivation, the mental model, why it works this way, alternatives considered, trade-offs, when *not* to use it, connections to other concepts.

**Forbidden content:** step-by-step instructions (link to the how-to), exhaustive parameter dumps (link to reference). Explanation can mention these but shouldn't *be* them.

**Opener template:** "*<Topic>* — what it is, why it works this way, and when to reach for it." Then bound the scope.

**Rules:**
- It's fine to express opinions and make recommendations here.
- Discuss alternatives and trade-offs honestly; this is where they belong.
- Connect ideas — explanation is the connective tissue between the other three.

---

## How to tell them apart (the common confusions)

The classifier fails in predictable ways. When a section feels muddy, it's usually one of these:

| Symptom | What happened | Fix |
|---|---|---|
| Tutorial keeps explaining theory | tutorial + explanation merged | move the theory to an explanation page; link to it |
| Reference page argues for an approach | reference + explanation merged | move the rationale out; reference only describes |
| How-to teaches from zero | how-to + tutorial merged | assume competence; link a tutorial for beginners |
| "Guide" that lists every option inline | how-to + reference merged | summarize the common path; link the full reference |
| Vague + random specifics in one para | two types fighting in one paragraph | split the paragraph by type |

That last row is the direct cause of the user's "vague formulations mixed with overly specific details" complaint. A paragraph trying to be both explanation and reference hedges on the concepts (vague) while dumping one or two exact values (trivia). Splitting by type fixes it: the explanation gets to be conceptual, the reference gets to be exact.

## Hybrid pages are fine — hybrid sections are not

Real docs mix types: a README has a tutorial-ish Quick Start, reference-ish API blocks, and explanation-ish architecture notes. That's correct. The rule is that each *section* stays one type internally. Classify sections, label them in your head, and don't let a reference block start explaining or a tutorial block start enumerating options.

## Quick decision aid

Ask: **what does the reader need right now?**
- To learn by doing → tutorial
- To accomplish a known task → how-to
- To look up a fact → reference
- To understand why → explanation
- To act inside the product at this exact moment → microcopy
