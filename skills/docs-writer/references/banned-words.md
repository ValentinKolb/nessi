# Word lists (review flags, not find-and-replace)

These lists come from established prose linters and style guides: write-good, alex.js, the Vale Microsoft and Google style packs, GOV.UK plain-language guidance, and Strunk & White. **They are review flags.** When a word here appears, stop and check it — don't delete or swap it reflexively. "Many clients connect at once" is correct English; the list flags "many" so you verify it's doing work, not so you remove it. Context always wins.

## Contents

- Wordy phrases → shorter replacements
- Weasel words (vague intensifiers)
- Hedges and zombie filler
- Plain-English swaps (GOV.UK / Microsoft)
- Condescension flags
- Marketing / hype words (banned in technical docs)
- Bias and non-inclusive terms
- Sentence-shape flags

---

## Wordy phrases → shorter

| Instead of | Use |
|---|---|
| utilize, make use of | use |
| in order to | to |
| due to the fact that, owing to the fact that | because |
| at this point in time, at the present time | now |
| in the event that | if |
| a number of, a large number of | several / many (or the count) |
| the majority of | most |
| has the ability to, is able to | can |
| in the process of | (often deletable) |
| for the purpose of | for / to |
| with regard to, in terms of | about / for |
| prior to | before |
| subsequent to | after |
| in spite of the fact that | although |
| it is important to note that | (delete) |
| there is / there are … that | (recast with the noun as subject) |

## Weasel words (write-good list — flag, don't auto-cut)

These are vague where a fact would be stronger. Replace with a number/name where one exists; otherwise consider deleting:

`very, fairly, quite, really, rather, somewhat, several, various, many, few, most, mostly, largely, relatively, remarkably, surprisingly, significantly, substantially, completely, clearly, vast, huge, tiny, excellent, interesting, interestingly`

## Hedges and zombie filler (delete unless meaning-bearing)

`basically, actually, simply, just, essentially, literally, obviously, of course, needless to say, it's worth noting, it should be noted, as a matter of fact, for all intents and purposes, kind of, sort of, in a sense`

## Plain-English swaps (GOV.UK / Microsoft)

| Instead of | Use |
|---|---|
| purchase | buy |
| assist | help |
| approximately | about |
| commence | start |
| terminate | end / stop |
| additional | more / extra |
| sufficient | enough |
| require | need |
| utilize | use |
| facilitate | help / ease |
| leverage (verb) | use |
| individuals | people |
| in advance of | before |
| i.e. | that is |
| e.g. | for example |
| via | through / by (often) |

(In developer docs, "leverage"/"utilize" still read as filler — prefer "use" everywhere.)

## Condescension flags (almost always delete)

`simply, just, easily, obviously, of course, clearly, trivially, naturally, everyone knows, as anyone knows, it's trivial, it's straightforward, all you have to do is`

These tell a stuck reader the difficulty is their fault. The instruction is identical without them. "Simply run `make`" → "Run `make`".

## Marketing / hype words (banned in technical docs)

`blazing-fast, blazingly fast, lightning-fast, powerful, robust, seamless, seamlessly, effortless, cutting-edge, state-of-the-art, world-class, next-generation, revolutionary, game-changing, best-in-class, turnkey, rich (set of features), elegant, beautiful (API), magical, delightful, simple and easy, easy-to-use`

Replace with a concrete claim. "Blazing-fast queue" → "lock-free queue, ~8M ops/sec single-threaded". If you can't substantiate it, cut it.

## Bias / non-inclusive terms

| Instead of | Use |
|---|---|
| master / slave | primary / replica, leader / follower, main |
| blacklist / whitelist | blocklist / allowlist, denylist / allowlist |
| master branch | main branch |
| sanity check | consistency check, soundness check |
| dummy value | placeholder, sample value |
| grandfathered | legacy, exempted |
| man-hours | person-hours, work-hours |
| chairman / he (generic) | chair, they / neutral rephrase |

Don't be heavy-handed — apply where the neutral term reads naturally, which is nearly always.

## Sentence-shape flags

- **Passive voice** — flag, don't ban. Prefer active ("the server validates the token") but passive is right when the actor is unknown or irrelevant ("the file was deleted").
- **Long sentences** — over ~25 words in end-user copy, or any sentence you have to re-read, is a split candidate.
- **Sentence-initial "So,"/"Now,"/"Basically,"** — usually cut the opener.
- **Adverb pile-ups** — `-ly` words clustering (`automatically and seamlessly handles`) signal hype; cut to the verb.
- **Nominalizations** — verbs turned into nouns ("perform a calculation" → "calculate", "make a decision" → "decide", "provide support for" → "support").

## How to apply

In the filler and audience-fit passes (`editing.md`), scan for these, and for each hit ask: *is this word carrying information or decoration?* Keep the carriers, cut the decoration, make the vague ones concrete. The goal is no wasted words — not the fewest possible words.
