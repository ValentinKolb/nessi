# The edit pass

The draft gets the content down. This pass makes it good. The reason it's separate from drafting: trying to write lean on the first pass produces vague, hedged sentences — the writer compresses by removing specifics instead of removing filler. Write freely, then cut deliberately.

Run the passes **in this order**, re-reading the whole text each time with exactly one job. One pass, one concern. Combining them is how concerns get missed.

1. Coverage *(long-form only — see `long-mode.md`)*
2. Redundancy
3. Filler
4. Specificity
5. Audience fit

Word lists for passes 3–5 are in `banned-words.md`. Treat every list hit as a flag to review, not a find-and-replace — context decides.

---

## Pass 1 — Coverage (long-form only)

Does the document cover everything its type requires? This is the antidote to long-but-shallow. Skip for short docs; for comprehensive ones, run the per-type checklist in `long-mode.md` before any polishing. Breadth first, then depth.

---

## Pass 2 — Redundancy

Say each thing once.

- **One canonical term per concept.** Pick one name and keep it. "Elegant variation" — calling the same thing a "queue", then a "buffer", then a "channel" to avoid repetition — confuses the reader into thinking they're different things. Repetition of the right term is clarity, not a style flaw.
- **Delete what the reader already knows.** If a sentence restates the previous sentence or the heading, cut it. Summaries that echo the title; intros that preview what the very next line says; "as mentioned above" recaps — all go.
- **Merge overlapping sections.** Two sections covering the same ground from slightly different angles should be one. Cross-link instead of restate: state a fact in its canonical home and link to it from elsewhere.
- **Diátaxis split.** Much duplication comes from one page trying to be tutorial + how-to + reference; the same fact gets stated in each register. Split by type and link.

**Before:**
> The cache stores results in memory. Results are kept in memory by the cache so that repeated lookups are fast. Because the cache holds results in memory, repeated lookups don't hit the database.

**After:**
> The cache keeps results in memory, so repeated lookups skip the database.

---

## Pass 3 — Filler

Cut words that carry no information.

- **Wordy phrase → short word:** `utilize → use`, `in order to → to`, `due to the fact that → because`, `at this point in time → now`, `a number of → several`, `has the ability to → can`, `make use of → use`. Full table in `banned-words.md`.
- **Hedges and intensifiers:** `very`, `quite`, `really`, `basically`, `actually`, `simply`, `just`, `fairly`, `somewhat` — delete unless the word changes the meaning. "Very fast" is weaker than the number; give the number or drop the "very".
- **Sentence-opening filler:** "There is / there are" + noun + "that" → make the noun the subject. "There are three options that control this" → "Three options control this." Sentence-initial "So," → cut.
- **Meta-narration:** "In this section, we will discuss…", "It's worth noting that…", "This guide is designed to…" → delete; just say the thing.

**Before:**
> It's worth noting that there are a number of different options that you can utilize in order to configure the timeout behavior.

**After:**
> Three options configure the timeout.

That's 24 words down to 4, with more information (the count).

---

## Pass 4 — Specificity

The two-sided pass — this directly fixes "vague formulations mixed with overly specific irrelevant detail." Both directions:

**Make vague things concrete.** Every qualifier that could be a number, type, or name should be one, or be deleted.
- "a large timeout" → "a 30-second timeout"
- "supports many formats" → "supports JSON, CSV, and Parquet"
- "should be fast" → "completes in under 10ms for 1k keys"

If you can't make it concrete, the sentence may not be worth keeping.

**Cut specifics no decision depends on.** A precise detail that changes nothing for the reader is noise dressed as rigor.
- The exact internal buffer size in a getting-started guide → cut (belongs in reference, if anywhere).
- The commit hash a feature landed in, in user-facing help → cut.

**The test for every detail:** *does any reader act differently because this is here?* If yes, keep and make it precise. If no, cut it or move it to a reference page. Vague + trivial in the same paragraph almost always means two doc-types are fighting — split them (see `diataxis.md`).

---

## Pass 5 — Audience fit

Re-read as the Step-1 reader. Ask their questions, not yours.

- **Too technical for this reader?** Define or replace jargon; expand acronyms; add the one sentence of context they need.
- **Too casual / loose for the context?** Tighten. A payment error isn't the place for personality; a runbook isn't the place for chattiness.
- **Sentences too long?** For end-user copy especially, split. One idea per sentence.
- **Condescension:** flag and usually delete `simply`, `just`, `obviously`, `of course`, `clearly`, `everyone knows`. The instruction is identical without them, and kinder to a stuck reader.
- **Bias:** `master/slave → primary/replica`, `blacklist/whitelist → blocklist/allowlist`, gendered generics → neutral. See `audience.md`.

---

## The Jenga test (overall)

From Shopify Polaris: treat the text like a Jenga tower — **what's the most you can remove before it collapses?** Pull words, sentences, and whole sections; if nothing essential falls, leave them out. Stop when the next removal would lose real information. This is the mindset for the whole pass, not a separate step.

## What this pass is not

- Not a license to delete real content to hit a word count. Concision means no *wasted* words, not few words. A complete reference is long and that's correct.
- Not blind find-and-replace. "Many" is sometimes exactly right. Lists flag; you judge.
- Not a tone-flattener. Character and warmth are fine where the audience and moment call for them; the pass removes *filler*, not *voice*.
