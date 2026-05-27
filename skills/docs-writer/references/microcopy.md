# Microcopy: text inside the product

Microcopy is the text a user reads while *doing something* — a tooltip, a field hint, an error, an empty state. It's the hardest to get right because the budget is tiny and the stakes are immediate: bad microcopy blocks a real action a real person is trying to take right now.

The governing idea: **microcopy helps the user act, at the moment they need to act.** It is not a place to teach, explain, or market. If something needs more than a sentence or two, it belongs in a help page that the microcopy links to — not in the microcopy.

## Contents

- The 3 I's (what microcopy is for)
- The 3 C's (what good microcopy is)
- Length budgets and templates per type
- Tone defaults for in-product text

---

## The 3 I's — what a piece of microcopy is doing

From NN/g. Before writing, know which job this text has:

- **Inform** — tell the user something they need to know to proceed (a field hint, a format requirement, a definition).
- **Influence** — nudge a decision (a reassurance under a submit button, a benefit next to an opt-in).
- **Interact** — label or confirm an action (button text, a confirmation, a success message).

A single string usually does one of these. If you're trying to inform *and* influence *and* interact in twelve words, split it or move the informing into a help link.

## The 3 C's — what makes it good

- **Clear** — the user understands it the first time, in context, without extra knowledge. Plain words, concrete nouns, the user's vocabulary not the system's.
- **Concise** — the fewest words that still inform. Cut every word that survives deletion without loss. (See the Jenga test in `editing.md`.)
- **Useful / Character** — it actually helps the task, and its tone fits the product and moment. Character never comes at the cost of clarity — a witty error the user can't act on is a failure.

---

## Length budgets and templates

These are starting budgets. The reader's need overrides them, but exceeding them is a signal to check whether the content belongs in a help page instead.

### Tooltip / hint

≤ 12 words, one idea. Explains a control or term the user can see. No period if it's a fragment.

- Bad: "This is the field where you can enter the name that you would like to give to your new project."
- Good: "Shown in your project list. You can change it later."

### Form-field description

One sentence, ≤ 15 words. Says what to enter or why it's needed — only when the label isn't self-evident. If the label is clear, write nothing; redundant hints are clutter.

- Label `Email` needs no hint.
- Label `API key` → "Found in Settings → Developer. Treat it like a password."

### Placeholder text

Not a description. Show an example value, not instructions, and never the only copy of essential info (placeholders vanish on focus).

- Good placeholder for a date field: `2026-05-27`
- Bad: using the placeholder to state the required format as the only place it appears.

### Error message

One sentence on *what happened*, one on *what to do*. Plain, specific, no blame, no error codes as the primary message (codes can follow in parentheses for support).

- Bad: "Error: invalid input."
- Good: "That email address is missing an @. Check it and try again."

Structure: **[what went wrong] + [how to fix it].** If you can't tell the user how to fix it, you haven't diagnosed the error well enough.

### Empty state

≤ 2 sentences: what would be here + the single next action. An empty state is an onboarding opportunity, not a dead end.

- Bad: "No items."
- Good: "No invoices yet. Create your first one to get started." (+ a button)

### Success / confirmation message

One sentence. Confirm what happened and, if useful, the next step. Don't celebrate trivial actions.

- Good: "Saved. Your changes are live."

### Button / action label

1–3 words, a verb the user would use for the outcome. "Save changes", "Delete project", "Send invite". Avoid vague "OK"/"Submit" where a specific verb fits. Destructive actions name the consequence: "Delete" not "Confirm".

### Confirmation dialog

Title states the consequence as a question or statement; body adds only what's needed to decide; buttons name the actions (not Yes/No).

- Title: "Delete this project?"
- Body: "This removes all 42 documents. This can't be undone."
- Buttons: "Delete project" / "Cancel".

### Onboarding / coachmark

One sentence per step, one idea per step. Show, don't lecture. If it takes five coachmarks, the UI may be the problem, not the copy.

---

## Tone defaults for in-product text

In-product microcopy leans plainer and warmer than reference docs, but the audience note from `audience.md` still governs. Defaults:

- **Plain English, the user's words.** "Couldn't connect" beats "Connection attempt unsuccessful." System vocabulary ("null", "exception", "token") only when the user is technical.
- **Verbs first, active voice.** "Choose a plan", not "A plan should be chosen".
- **Drop "please" by default.** It pads UI text and gets repetitive. Reserve it for moments that genuinely interrupt or inconvenience the user.
- **Minimize "we".** The product talks about the user's task, not about itself, except where a human voice genuinely reassures.
- **No humor in error, payment, security, or destructive-action copy.** These moments need clarity and calm, not personality.
- **Consistency over cleverness.** Same concept, same word, every time — across the whole product. A user who learns "workspace" should never also see it called "team", "org", and "space".
