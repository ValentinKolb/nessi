# Audience: who is reading this

The single biggest cause of wrong-register documentation is never deciding who it's for. A page written for "whoever lands here" ends up too technical for beginners and too basic for experts at the same time. Fix it by naming the reader before writing, then making every tone and detail decision in service of that reader.

## The audience note (Step 1 of the workflow)

Write this before drafting. It's internal — it never appears in the output — but it anchors everything after it:

```
Audience:      <who they are — role, not "users">
Knows already: <what you can safely assume, so you don't over-explain>
Wants to:      <the specific task or question that brought them here>
Register:      <reading level / formality / how much jargon is OK>
```

If the user hasn't specified the audience and you can't infer it confidently from context (the repo, the product, the surrounding docs), ask one quick question. Guessing wrong wastes the whole draft.

## Prebuilt personas

Common readers and how to write for each. Adapt; these are starting points.

### Developer evaluating a library (README, landing docs)
Skim-reading, deciding in 30 seconds whether this solves their problem. Knows their domain; doesn't know your project.
→ Lead with what it is and the key claim. Show a working example fast. Be honest about scope and trade-offs. Jargon from the domain is fine; jargon from your internals is not (yet).

### Developer integrating your API (reference, how-to)
Has committed, now needs facts. Wants completeness and accuracy over warmth.
→ Complete reference, consistent structure, runnable examples, every error documented. Dry is good here. Don't make them guess defaults or hunt for the error list.

### Ops engineer running the thing (runbook, deployment guide)
Possibly at 3am, possibly mid-incident. Wants the exact command and the success condition.
→ Imperative steps, copy-pasteable, explicit verification, a troubleshooting section. No theory inline — link it. Assume competence, not context.

### End user filling out a form (microcopy)
Not technical, focused on their goal, will not read paragraphs. Every word competes with their patience.
→ Plain language, their vocabulary, ≤ 1 sentence hints, no system jargon, no acronyms without expansion. Help them act and move on.

### End user hitting an error (error/empty states)
Mildly to severely frustrated. Wants to know what broke and how to get unstuck — nothing else.
→ Plain, specific, blameless. What happened + what to do. No codes as the headline, no humor, no "oops!".

### Contributor / future maintainer (CONTRIBUTING, ADRs, architecture)
Technical, invested, wants the *why* behind decisions.
→ Explanation-type writing. Rationale, trade-offs, what was tried and rejected. This reader earns the digressions a user never would.

---

## Tone selectors by mode

### Technical docs → Google/Microsoft developer style
- Second person ("you"), imperative for instructions ("Run the migration").
- Present tense ("the function returns", not "will return").
- Active voice; name the actor.
- Contractions are fine and read more naturally ("don't", "you'll").
- Conversational but not chatty — write like a knowledgeable colleague explaining to a peer, not a textbook and not a hype man.
- Define an acronym on first use, then use it freely.

### End-user microcopy → plain, warm, minimal
- Plainest accurate word wins ("use" not "utilize", "about" not "approximately").
- The user's vocabulary, not the system's.
- Drop "please"; minimize "we"; verbs first.
- See `microcopy.md` for the full set.

### Safety / legal / payment copy → precise, neutral, complete
- Full sentences, no humor, no clever brevity that loses precision.
- Say exactly what happens, especially for irreversible actions.

---

## Reading level

Match complexity to reader, and treat these as review flags, not gates (readability scores are noisy):

- **End-user copy:** aim for roughly grade 8–9 (Flesch–Kincaid ~60+). Short sentences, common words. Plain language is preferred even by expert readers — research on plain-English rewrites consistently finds large majorities prefer the clear version, and the preference grows with the topic's complexity.
- **Developer docs:** grade 10–12 is fine; the vocabulary is technical but the *sentences* should still be short and direct. Technical content is not an excuse for tangled syntax.

Lowering reading level means shorter sentences and commoner words — not dumbing down the content. You can explain a hard idea in simple sentences.

---

## Jargon

- **Developer docs:** domain and tool names are fine used directly ("the Hono middleware", "the Bun test runner") — explaining them would insult the reader.
- **End-user docs:** every acronym is expanded on first use or replaced; technical nouns get a plain-language equivalent. If a term is unavoidable, define it inline in a few words.
- The test: would the Step-1 reader have to look this word up to act? If yes, define or replace it.

## Bias-free and non-condescending language

Apply in the audience-fit edit pass. Replacements:

- `master / slave` → `primary / replica` (or `main`, `leader/follower` as fits).
- `blacklist / whitelist` → `blocklist / allowlist` (or `denylist / allowlist`).
- gendered roles (`chairman`, `manmade`, `he` as generic) → neutral forms.
- ableist usage as metaphor (`crazy`, `insane`, `lame`, `sanity check` → `consistency check`, `soundness check`) — case by case; don't be heavy-handed, but prefer the neutral term where it reads naturally.

Condescension flags — usually delete the word, and the sentence is stronger:

- `simply`, `just`, `easily`, `obviously`, `of course`, `clearly`, `everyone knows`, `it's trivial`.

These tell a stuck reader that their difficulty is their own fault. "Simply run the command" reads as a taunt to anyone for whom it didn't simply work. Cut "simply" and the instruction is identical and kinder.
