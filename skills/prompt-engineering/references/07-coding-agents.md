# 07 — Coding Agents

How to write system prompts for AI coding assistants and agents. Based on analysis of Claude Code, Cursor, Windsurf, Aider, pi-coding-agent, and OpenCode.

## Table of contents

1. The coding agent spectrum
2. Core principles every coding prompt needs
3. File editing patterns
4. Anti-overengineering rules
5. Planning and persistence
6. Error recovery
7. Reference prompts from production agents

---

## 1. The coding agent spectrum

Coding agents range from minimal to maximal:

**Minimal (pi-coding-agent, ~500 token prompt):** 4 tools (read, write, edit, bash). Philosophy: "frontier models already understand what a coding agent is." Relies on model's training, not prompt engineering.

**Medium (Aider, ~2000 tokens):** No formal tools — uses SEARCH/REPLACE text blocks. Repo-map for context. Direct, expert-level instructions.

**Maximal (Claude Code, ~8000+ tokens):** 24 tools, sub-agents, dynamic prompt assembly, memory system, security review, anti-distillation countermeasures.

For most custom coding agents, the sweet spot is the medium range — enough structure to guide behavior, not so much that it overwhelms the context.

---

## 2. Core principles every coding prompt needs

### Identity and competence framing

```
You are an expert software developer.
Always use best practices when coding.
Respect existing conventions, libraries, and patterns in the codebase.
```

Aider's approach is refreshingly direct. No elaborate backstory — just "you're an expert, act like it."

### Read before writing

Every production coding agent emphasizes this:

```
Before making changes:
- Read the relevant files
- Understand the existing code structure
- Check for patterns and conventions already in use
- Don't guess at file contents — read them
```

OpenAI's GPT-4.1 guide: "If you are not sure about file content or codebase structure, use your tools to read files and gather the relevant information: do NOT guess."

### Minimal changes

```
Only make the changes that are necessary to complete the task.
Don't refactor surrounding code unless asked.
Don't add features beyond what was requested.
Don't "improve" code you weren't asked to touch.
```

This prevents the common failure mode where the agent rewrites half the codebase to fix a one-line bug.

### Working code

```
Always write code that runs.
Include necessary imports.
Handle the obvious error cases.
Don't leave TODO comments for things you could implement now.
```

Cursor: "Provide immediately runnable code when applicable, without unnecessary setup."

---

## 3. File editing patterns

### SEARCH/REPLACE (Aider pattern)

No tool system needed. The model outputs text blocks that the harness parses:

```
To edit a file, use a SEARCH/REPLACE block:

path/to/file.py
<<<<<<< SEARCH
def old_function():
    return "old"
=======
def old_function():
    return "new"
>>>>>>> REPLACE

Rules:
- SEARCH must match the file content EXACTLY
- Include enough context to uniquely identify the location
- Keep changes minimal — only change what's needed
```

**Advantage:** Works without tool-calling support. Good for smaller models.
**Disadvantage:** Model must reproduce exact text, which can cause errors with long blocks.

### Single-call file edits (Windsurf/Cursor pattern)

```
CRITICAL: Combine ALL changes to a file into a SINGLE edit call.
Never make multiple sequential edits to the same file.
```

This prevents race conditions and ensures atomic changes.

### Write full files (simple but token-expensive)

For small files or new files, just write the complete content:

```
When creating new files, write the complete file content.
Don't use placeholder comments like "// rest of the code here".
```

---

## 4. Anti-overengineering rules

Claude Code has the best formulation of this:

```
Don't add features, refactor code, or make "improvements" beyond what was asked.
Don't add error handling, fallbacks, or validation for scenarios that can't happen.
Don't create helpers, utilities, or abstractions for one-time operations.
Three similar lines of code is better than a premature abstraction.
```

### The YAGNI principle in prompt form

```
If you're about to create a utility function that will only be called once,
just write the code inline instead.

If you're about to add error handling for a case that's not in the requirements,
don't. Handle it when and if it becomes a real problem.

If you're about to add a configuration option for something that's currently
hardcoded and working, leave it hardcoded.
```

---

## 5. Planning and persistence

### OpenAI's three critical instructions

These reportedly increased their internal SWE-bench score by ~20%:

```
1. Persistence: Keep going until the user's query is completely resolved.
   Don't give up early or yield back to the user prematurely.

2. Tool-calling: Don't guess about file content or code structure.
   Use tools to read files and gather information.

3. Planning: Plan extensively before each function call, and reflect
   extensively on the outcomes of previous function calls.
```

### Claude Code's exploration pattern

```
When diagnosing issues:
1. Form a hypothesis
2. Use tools to test it
3. If wrong, form a new hypothesis — don't ask the user
4. Continue until you find the root cause or exhaust options
```

### The "thinking aloud" approach

For coding tasks, step-by-step reasoning helps:

```
Before making changes:
1. State what you understand the problem to be
2. Identify the files involved
3. Describe your approach
4. Make the changes
5. Verify they work (run tests if available)
```

---

## 6. Error recovery

### Build → run → fix loop

```
After making changes:
1. Run the relevant command (build, test, lint)
2. If it fails, read the error carefully
3. Fix the issue
4. Run again
5. Repeat until it passes — don't ask the user to run it for you
```

### Common coding errors to handle in the prompt

```
If you get a linting error, fix it immediately — don't leave it for the user.
If you get a type error, check the types and fix your code.
If a test fails, read the test to understand what's expected, then fix your code.
If a dependency is missing, install it.
```

### When to ask for help

```
Ask the user only when:
- You need information you can't find in the codebase
- There are multiple valid approaches and the user should choose
- You've tried 3+ approaches and none worked
- The task requires access to a service or credential you don't have
```

---

## 7. Reference prompts from production agents

### Pi coding agent (minimal)

```
You are an expert coding assistant operating inside pi, a coding agent harness.
You help users by reading files, executing commands, editing code, and writing new files.
```

Just 2 sentences + 4 tool definitions. Works with frontier models because they've been extensively trained on coding tasks.

### Aider (medium)

```
Act as an expert software developer.
Always use best practices when coding.
Respect and use existing conventions, libraries, etc that are already present in the code base.

Take requests for changes to the supplied code.
If the request is ambiguous, ask questions.

Once you understand the request, suggest changes using SEARCH/REPLACE blocks.
```

Clean, direct. No fluff. Relies on the model's inherent understanding of software engineering.

### OpenCode (provider-aware)

OpenCode dynamically sets the identity based on the provider:
- Anthropic: "You are Claude, a large language model trained by Anthropic"
- OpenAI: "You are an expert coding assistant"
- Gemini: "You are an advanced AI coding assistant"

This reportedly improves behavior by matching the identity the model was trained to expect.

### Key takeaway

The most effective coding prompts share a philosophy: **trust the model's competence, constrain its scope, enforce verification.** Don't teach it how to code — it already knows. Tell it what to code, how to verify, and when to stop.
