# Structure: orientation first, then detail

This file fixes the "no overview" problem. The reader should always know the shape of what they're reading before they hit the detail, and should get the important part even if they stop early.

## Contents

- The inverted pyramid
- The cognitive funnel
- Above-the-fold orientation (TOC rules)
- README house style (the default for code projects)
- Headings, code examples, diagrams, tables

---

## The inverted pyramid

Borrowed from journalism: **put the conclusion first, then the supporting detail, then the background.** The opposite — building up to a conclusion — is how academic writing works and it's wrong for documentation, because readers scan and bail.

Apply it at three scales:

- **Document:** the first paragraph states what this is and the single most important thing to know. Architecture deep-dives and history go last.
- **Section:** the first sentence states the section's point. The rest supports it.
- **Sentence:** the main clause carries the information; qualifications come after.

The test: if the reader stops after the first sentence of any unit, did they get the most important thing? If the important thing is buried in sentence four, reorder.

**Before (build-up):**
> The library was created because existing solutions had high memory overhead and complex APIs. After evaluating several approaches, we settled on a design that uses a single ring buffer. This is a fast, allocation-free queue for Bun.

**After (pyramid):**
> A fast, allocation-free queue for Bun. It uses a single ring buffer, which keeps memory flat and the API to three methods.

---

## The cognitive funnel

Order content general → specific, common → rare, frequent → edge-case. The reader descends only as far as they need. From the Art of README: start with the most general (name, what it is, an example), and let interested readers narrow toward specifics (full API, internals, configuration).

A README's natural funnel:

```
What it is (1 sentence)
   └─ Why / when to use it (1 short paragraph)
        └─ Quick Start (copy-pasteable, working in 3 lines)
             └─ Core API / features (the 80% case)
                  └─ Full configuration / advanced (the 20%)
                       └─ Architecture / internals (the curious)
```

Don't invert this. Configuration options before the reader knows what the thing does is the most common README mistake.

---

## Above-the-fold orientation

Any document over ~300 words needs orientation near the top so the reader sees the structure before the substance.

- **READMEs and guides:** a short table of contents, ideally one scannable line or a 3–7 item list. More than ~9 top-level entries means the document should be split.
- **Long help articles:** a one-paragraph "what this covers" summary, then the TOC.
- **Reference pages:** an index or grouped list of everything documented, linked.

The summary must not just echo the title. If the page is titled "Configuring TLS", the summary shouldn't open "This page is about configuring TLS." Use the space to say something the title didn't: what's in scope, what's not, what the reader will be able to do.

Keep the critical information plus the TOC inside the first screenful.

---

## README house style (default for code projects)

This is the default shape for a project README, reverse-engineered from READMEs the user considers good and consistent with the `common-readme` / Art of README tradition. It is a default; if the project already has a house style, follow that.

**Section order:**

1. **Name + one-line definition.** Bold name, then a single sentence: what it is and the key technical claim. No tagline fluff. Example shape: "**dKV** — a distributed, consistent key-value store for Go, built on Raft."
2. **Status note (if relevant).** One line, one emoji at most: "⚠️ Early development, not production-ready."
3. **One-line TOC** (for longer READMEs): dot- or pipe-separated links to the main sections.
4. **Quick Start** — the *first real section*. Copy-pasteable install + smallest working example that produces a visible result. Not a separate "Installation" then "Usage"; get them running in three lines.
5. **Core API / features** — one block per feature: a short heading, one sentence of description, one runnable example, then a bullet list of non-obvious behaviors. Don't put Parameters/Returns tables here; those live in the reference or the type signatures.
6. **Configuration / advanced** — the less-common surface, after the common one.
7. **Architecture** *(optional)* — ASCII diagram + prose for the curious. Late, because most readers don't need it.
8. **End matter** — License (one line + link), optional Acknowledgments (a few named credits). Skip Contributing/CoC/Roadmap unless the project actually needs them in the README.

**What a good project README omits:** marketing-adjective "Features" lists, "Why X?" justification essays, emoji-decorated headings, "Built with ❤️" footers, "⭐ Star this repo", screenshots in a pure library.

**Length is sized to complexity, not padded.** A tiny utility gets ~300–500 words. A library with a CLI, a server, and an API earns ~1,500–2,000. Don't pad a simple project to look serious; don't cram a complex one to look minimal.

---

## Headings

- Sentence case: "Quick start", not "Quick Start" or "QUICK START". (Match the project's existing convention if it has one.)
- No trailing punctuation.
- No emoji prefixes.
- ≤ 8 words, frontloaded with the noun or verb that matches the reader's task. "Rotate the signing key" beats "Information about how key rotation works".
- Headings should be scannable as a standalone outline. If you read only the headings, the document's logic should be clear.

## Code examples

- Runnable and minimal. Include the imports; show the smallest real usage that produces a result.
- Don't over-comment obvious lines; comment the non-obvious one.
- Prefer one focused example over one example that demonstrates five features at once.
- Show expected output when it helps the reader confirm success.

## Diagrams

- ASCII box diagrams inside fenced code blocks are the default for architecture — they live in the text, diff cleanly, and need no toolchain.
- Use images only where they genuinely beat text: a UI screenshot, a benchmark plot, a rendered result.
- A diagram should reduce words, not decorate. If the prose already makes it clear, drop the diagram.

## Tables

- Only for genuinely tabular data: options with types and defaults, comparison matrices, key-value lists with several columns.
- Don't table a two-item list or a single concept — prose or bullets are clearer.
- Keep columns consistent and headers short.
