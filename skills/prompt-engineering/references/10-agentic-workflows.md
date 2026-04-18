# 10 — Agentic Workflows

How to design prompts for autonomous agents that persist through multi-step tasks, track their own progress, communicate status, and gracefully handle failures and context limits. Based on analysis of Claude Code v2.0, Cursor v1.0–v2.0, Windsurf/Cascade, Devin AI, Manus AI, OpenAI Codex CLI, Gemini CLI, Cline, and Kiro.

## Table of contents

1. The agentic loop — iterative, not linear
2. Agentic persistence — "keep going until done"
3. Planning and progress tracking
4. Status updates and progress communication
5. Autonomy levels — when to act, when to ask
6. Parallel vs. sequential execution
7. Procedural self-correction
8. Context limits and graceful degradation
9. Communication channel design
10. Reference: How production agents structure their loops

---

## 1. The agentic loop — iterative, not linear

Most assistant prompts define a linear flow: understand → act → answer. That works for single-turn Q&A. Agentic tasks need a **loop** — the agent acts, observes the result, decides whether it's done, and if not, acts again.

### Linear flow (insufficient for agents)

```
1. Understand what the user wants
2. Check tools
3. Act
4. Answer
```

This produces agents that stop after one tool call, even when the task requires five.

### Iterative loop (what production agents use)

```
For every user request:
1. Understand — What's the goal? What does "done" look like?
2. Plan — Break into steps if complex.
3. Act — Use tools to complete the next step.
4. Observe — Did it work? Is the result correct?
5. Check — Is the task fully done?
   → No: go to step 3.
   → Yes: respond with the result.
```

### Manus AI's event-driven loop (most explicit)

Manus has the most formalized agent loop of any production system:

```
1. Analyze Events — Read the event stream (messages, actions, observations, plans)
2. Select Tool — Choose one tool for this iteration
3. Wait — Observe the result
4. Iterate — If not done, go to step 1
5. Submit — Return final results to the user
6. Standby — Wait for next task
```

The key difference: step 4 explicitly loops back. Without this, agents default to single-pass behavior.

### The exit condition

Every loop needs a clear "done" signal. Without one, agents either stop too early or loop forever.

**Good:**
```
Keep working until:
- The user's request is fully resolved, OR
- You've tried 3+ approaches and all failed — explain what you tried and ask for guidance, OR
- You need information only the user can provide
```

**Bad:**
```
Keep going until done.
```

"Keep going until done" without exit conditions creates infinite loops on impossible tasks.

### Model size guidance

- **Small models (7B-13B):** Use the linear flow with a single retry: "If the first approach fails, try one alternative. If that also fails, explain and ask." Loops confuse small models.
- **Mid-size models (14B-30B):** Simple loops work with explicit exit conditions. Keep to 3-5 steps max. Use numbered steps, not abstract descriptions.
- **Large models (70B+):** Full iterative loops with conditional branching. Can handle abstract exit conditions and self-assessment of completeness.

---

## 2. Agentic persistence — "keep going until done"

The single most universal pattern across all agentic tools. Every production agent has a variant:

**Cursor:**
```
You are an agent — please keep going until the user's query is
completely resolved, before ending your turn and yielding back
to the user. Only terminate your turn when you are sure that
the problem is solved.
```

**Claude Code:**
```
IMPORTANT: You should be persistent and thorough in your work.
Don't give up easily or ask the user for clarification unless
truly necessary. Make full use of your tools to gather information
and solve problems.
```

**Codex CLI:**
```
You are an agent — keep going until the user's query is completely
resolved. Do not end your turn early or ask the user to perform
actions they could delegate to you.
```

**Devin:**
```
You are Devin, a software engineer using a real computer.
[Only communicates to user for: environment issues, deliverables,
missing information, permission requests — everything else is autonomous]
```

### The persistence spectrum

Not all agents should be equally persistent. The right level depends on the use case:

```
Low persistence (simple assistant):
  "Answer the question. If unsure, say so."

Medium persistence (tool-equipped assistant):
  "Try your tools before saying you can't do something."

High persistence (agentic assistant):
  "Keep working until the task is fully done. Try alternatives
   when something fails. Only ask the user when you genuinely
   need information you can't obtain yourself."

Maximum persistence (autonomous agent):
  "Work independently until the task is complete. Only contact
   the user for deliverables or missing permissions."
```

Choose the level that matches your agent's capabilities and the user's expectations.

### The anti-pattern: premature yielding

Without persistence instructions, agents default to asking permission at every step:

```
BAD: "I could search the web for the latest version. Would you like me to?"
BAD: "I found an error in the file. Should I fix it?"
BAD: "The first approach didn't work. Want me to try another?"

GOOD: [searches, finds version, reports result]
GOOD: [fixes the error, shows what changed]
GOOD: [tries the alternative, reports outcome]
```

The Action Bias pattern (see 08-prompt-patterns.md) handles single steps. Agentic Persistence handles the **sequence** — the agent doesn't just act once, it keeps acting until the job is done.

---

## 3. Planning and progress tracking

For complex multi-step tasks, agents need a way to plan ahead and track what they've done. Five of ten analyzed production agents have dedicated planning tools.

### The planning spectrum

**No planning (works for simple agents):**
Agent executes step by step without explicit planning. Fine for 1-3 step tasks.

**Implicit planning (mention it in the prompt):**
```
For complex tasks, think about the steps before you start.
Break the task into manageable pieces, then work through them one by one.
```

**Explicit planning with a tool (what production agents use):**
```
Use the plan tool to:
1. Create a plan before starting complex tasks (3+ steps)
2. Mark steps as in_progress when you start them
3. Mark steps as completed when done
4. Update the plan when scope changes
```

### What makes a good plan (from Codex CLI)

Codex CLI includes explicit examples of good and bad plans:

**Good plan:**
```
1. Read the API route handler in src/routes/users.ts
2. Add input validation using zod schema
3. Add error response for invalid input (400)
4. Add test case for invalid input in tests/users.test.ts
5. Run tests to verify
```

**Bad plan:**
```
1. Understand the codebase
2. Make the necessary changes
3. Test everything
```

The difference: good plans have specific, verifiable steps. Bad plans are vague and unverifiable.

### When to plan vs. when to just act

```
Just act:
- Simple questions (one tool call)
- Clear, single-step tasks
- Obvious next steps

Plan first:
- Tasks with 3+ steps
- Tasks where the order matters
- Tasks where failure of one step affects others
- Tasks the user will want to review before execution
```

### Plan update triggers (Windsurf pattern)

```
Update the plan when:
- You receive new instructions from the user
- You complete a step
- You learn something that changes the scope
- An approach fails and you need to pivot
```

Windsurf mandates plan updates BEFORE and AFTER significant work. This creates natural checkpoints.

### Claude Code's TodoWrite pattern

Claude Code uses a todo list as the primary tracking mechanism:

```
Use TodoWrite to:
- Break tasks into concrete steps
- Track status: pending → in_progress → completed
- Mark items done AS SOON as you complete them
- Add new items when scope expands

Use VERY frequently — not just for big tasks.
It helps you stay organized and shows the user your progress.
```

The emphasis on "VERY frequently" is deliberate. Without it, agents create plans but forget to update them.

---

## 4. Status updates and progress communication

What should the user see while the agent works through a multi-step task? This is surprisingly underspecified in most prompts — but the best agents handle it explicitly.

### Cursor's status update spec (most detailed)

Cursor v2.0 defines a full specification for progress communication:

```
Status updates:
- Brief progress notes (1-3 sentences)
- Conversational style, not formal reports
- Send before and after each tool batch
- Focus on what you're doing and why, not technical details

Examples:
  "Looking at the test files to understand the expected behavior."
  "Found the issue — the handler doesn't validate input. Fixing now."
  "Tests pass. Let me also check if there are similar handlers that need the same fix."
```

### Codex CLI's preamble messages

Codex CLI requires brief status messages before tool calls:

```
Before each tool call, send a brief preamble explaining what you're about to do.

Good examples:
  "Ok cool, so I've wrapped my head around the repo. Now digging into the API routes."
  "Interesting — there's a discrepancy between the types and the runtime. Let me investigate."
  "Found it. The config is missing a required field. Fixing now."

Bad examples:
  "I will now proceed to examine the repository structure." (too formal)
  "Searching..." (too terse)
  "" (no preamble at all)
```

### Devin's minimal communication model

Devin takes the opposite approach — the agent is almost silent, communicating only on specific triggers:

```
Communicate to the user ONLY when:
- Encountering environment issues that block progress
- Sharing deliverables (final results)
- Critical information cannot be accessed
- Requesting permissions or credentials
```

This works for fully autonomous agents where users don't watch the process. For interactive assistants, Cursor's approach is better.

### Manus's typed communication channels

Manus distinguishes two types of user communication:

```
notify — non-blocking. Inform the user without stopping work.
  "Starting to analyze the uploaded data."

ask — blocking. Stop and wait for user input.
  "The file has 3 sheets. Which one should I analyze?"
```

The key insight: most progress updates should be `notify` (non-blocking). Use `ask` (blocking) only when you genuinely need user input to proceed.

### Pattern for personal assistants

```
During multi-step tasks:
- Before starting: briefly say what you'll do.
- During: show progress naturally, not as formal status reports.
- After each major step: mention what happened and what's next.
- At the end: show the result, not a play-by-play of every step.

Don't narrate tool calls. Don't say "I'm now going to search..."
Just search and share what you found.
```

### Model size guidance

- **Small models:** Don't add progress communication rules — they consume too much attention and small models often produce unhelpful updates. Let the natural tool output speak.
- **Mid-size models:** One rule is enough: "For multi-step tasks, briefly mention what you're doing between steps."
- **Large models:** Can handle the full Cursor-style spec with before/after updates and conversational tone.

---

## 5. Autonomy levels — when to act, when to ask

Every agent needs a clear policy on when to proceed autonomously and when to ask the user. Without explicit rules, agents either ask too much (annoying) or too little (dangerous).

### The autonomy spectrum (from analyzed tools)

**Fully autonomous (Devin, Manus):**
Agent works independently. Only contacts user for deliverables or missing permissions.

**High autonomy (Claude Code, Cursor):**
Agent acts by default. Asks only when information is genuinely missing or when multiple valid approaches exist.

**Medium autonomy (nessi, Codex CLI):**
Agent acts for known-safe operations. Asks before destructive or ambiguous actions.

**Low autonomy (Cline):**
Every tool call requires user approval. Agent proposes, user confirms.

### The permission matrix pattern

Codex CLI has the most sophisticated autonomy model — a matrix of filesystem access × approval mode:

```
Filesystem:
  read-only     — can read files, nothing else
  workspace     — can read and write within the project
  full-access   — can read and write anywhere

Approval:
  always-ask    — every action needs approval
  ask-on-fail   — auto-proceed, ask only when something fails
  ask-on-risk   — auto-proceed for safe actions, ask for risky ones
  never-ask     — fully autonomous
```

For most personal assistants, the sweet spot is **workspace + ask-on-risk**.

### Defining "safe" vs. "risky" actions

```
Safe — proceed automatically:
- Reading files, searching, web lookups
- Creating new files (not overwriting)
- Running read-only commands
- Saving memories the user explicitly requested

Risky — confirm first:
- Deleting files or data
- Running commands that modify system state
- Overwriting existing files with different content
- Sending emails or messages on behalf of the user
- Any action that's hard to undo
```

**Windsurf pattern (emphatic):**
```
A command is unsafe if it may have destructive side-effects.
You must NEVER run a command automatically if it could be unsafe.
```

### The "ambition calibration" pattern (Codex CLI)

A nuanced autonomy rule that adjusts based on context:

```
For new tasks with no prior context: be ambitious and creative.
Demonstrate what's possible. Take initiative.

For tasks in an existing system: be surgical and precise.
Do exactly what was asked. Don't restructure, don't "improve."
```

This avoids the common failure mode where agents either do too little (for new work) or too much (for existing systems).

### When to ask — the decision tree

```
Can I proceed without user input?
├── I have all the information I need
│   ├── The action is safe → DO IT
│   └── The action is risky → ASK FIRST
├── I'm missing information
│   ├── I can find it with tools → FIND IT, THEN ACT
│   └── Only the user knows → ASK
└── Multiple valid approaches exist
    ├── One is clearly better → DO IT
    └── Trade-offs are real → ASK WHICH ONE
```

---

## 6. Parallel vs. sequential execution

This is a design decision with significant implications for speed, reliability, and prompt complexity.

### Parallel execution (Cursor, Claude Code v2)

Cursor marks this as "CRITICAL INSTRUCTION":

```
For maximum efficiency, whenever you perform multiple independent
operations, invoke all relevant tools concurrently.

DEFAULT TO PARALLEL. Only use sequential execution when one
operation depends on the result of another.

Examples of parallel operations:
- Reading multiple files at once
- Searching in different directories
- Running independent checks

Examples of necessarily sequential:
- Read a file, then edit based on contents
- Run a command, then check its output
- Search for something, then fetch the result
```

### Sequential execution (Cline)

Cline deliberately uses one tool per message:

```
You can use one tool per message, and will receive the result
of that tool use in the user's response.
```

The tradeoff: slower, but each step is reviewable and the agent can't cascade errors across parallel calls.

### When to instruct parallel vs. sequential

```
Instruct parallel when:
- The agent has many independent tools
- Speed matters (interactive use)
- Tool calls are unlikely to fail
- The model reliably handles parallel schemas

Instruct sequential when:
- Each step depends on the previous result
- User wants to review each step
- Tool calls are expensive or risky
- The model struggles with parallel tool calling

Default for most agents:
- Parallel for reads (search, lookup, fetch)
- Sequential for writes (edit, create, delete)
```

### Model size guidance

- **Small models:** Don't instruct parallel. Most small models can't reliably handle multiple tool calls in one turn.
- **Mid-size models:** Test thoroughly. Some handle 2 parallel calls well, more than that is unreliable.
- **Large models (frontier APIs):** Parallel is reliable and should be the default for independent operations.

---

## 7. Procedural self-correction

Standard self-correction is about content: "If you said something wrong, correct it." Procedural self-correction is about **workflow**: "If you violated your own process, fix it immediately."

### Cursor's non-compliance mandate (v2.0)

```
If you fail to call todo_write to check off tasks before
claiming them done, self-correct in the next turn immediately.
```

This is remarkably effective. Without it, agents "forget" process steps and drift. With it, the agent catches its own procedural errors.

### Pattern: Procedural self-correction

```
If you realize you skipped a step in your workflow:
- Acknowledge it briefly: "Missed a step — fixing that."
- Go back and do the step properly.
- Don't pretend it didn't happen.
- Don't apologize at length — just fix it and move on.

Common process violations to watch for:
- Using a skill without reading its documentation first
- Giving an answer without checking available tools
- Claiming a task is done without verifying the result
- Making changes without understanding the current state
```

### The verification checkpoint

Insert checkpoints into the workflow where the agent must verify its own compliance:

```
After completing a task:
□ Did I check for relevant skills before acting?
□ Did I verify the result after making changes?
□ Did I cite where my information came from?
□ Did I save any new user information I learned?

If you missed any: go back and do it now.
```

### Model size guidance

- **Small models:** Don't add self-correction rules — they add complexity without benefit. Small models struggle to self-assess.
- **Mid-size models:** One simple rule: "After acting, check if the result matches what was asked."
- **Large models:** Full procedural self-correction with specific violations to watch for.

---

## 8. Context limits and graceful degradation

What happens when the conversation exceeds the context window? Production agents handle this explicitly.

### Windsurf's aggressive memory creation

Windsurf creates memories liberally because it knows context will be deleted:

```
As soon as you encounter important information or context,
proactively use the create_memory tool.
ALL CONVERSATION CONTEXT, INCLUDING checkpoint summaries, will be deleted.
You DO NOT need USER permission to create a memory.
```

The logic: anything not saved to persistent memory is lost forever.

### Cline's handoff protocol

Cline has a `new_task` tool for structured handoffs when context is full:

```
Create a handoff document that contains:
- What was the original goal
- What has been completed
- What's still open
- Key decisions and context
- Specific file paths and line numbers

This should be enough for a totally new agent to pick up
where you left off, without any prior conversation context.
```

### Claude Code's context management strategy

Claude Code uses sub-agents to manage context:

```
When doing file search, prefer to use the Task tool to reduce context usage.
```

By delegating searches to sub-agents, the main agent's context stays clean for the actual work.

### Pattern: Graceful degradation

```
For long tasks:
- Save important findings to memory as you go, not just at the end.
- If the conversation is getting long, summarize key decisions
  before continuing.
- When delegating sub-tasks, include all necessary context —
  the sub-agent doesn't share your conversation history.

If you notice the conversation is very long:
- Focus on completing the current task.
- Save progress so far (to memory or file).
- Keep responses concise to preserve context space.
```

### Pre-emptive context management

Don't wait until the context is full — manage it proactively:

```
For tasks that will take many steps:
1. Save the goal and plan to memory/file at the start.
2. After each major step, save the outcome.
3. At the end, save a summary of what was done.

This ensures continuity even if the conversation is lost.
```

---

## 9. Communication channel design

Production agents don't just "respond in text." They use structured communication channels designed for different purposes.

### Manus's channel taxonomy

```
notify — Non-blocking update. Work continues.
  "Processing the uploaded spreadsheet..."
  "Found 3 relevant documents."

ask — Blocking question. Wait for user response.
  "The data has inconsistencies. Should I use column A or column B?"

submit — Final delivery. Task complete.
  [Presents the result with all deliverables]
```

**Key principle:** Minimize `ask` calls. Every `ask` stops the agent and waits. Most updates should be `notify`.

### Devin's communication trigger list

Devin defines exactly when to communicate:

```
Contact the user ONLY when:
1. Environment issues block progress (missing credentials, broken setup)
2. Sharing final deliverables
3. Critical information can't be found any other way
4. Requesting explicit permissions

Do NOT contact the user for:
- Progress updates during normal work
- Asking about approach when one is clearly better
- Confirming next steps that follow logically
```

### Pattern for interactive assistants

```
During a task:
- Short natural updates between steps (not formal status reports)
- Use the UI's native progress mechanisms when available
- Don't narrate tool calls — share the result, not the process

Stopping to ask:
- Only when genuinely blocked
- Include what you've tried and why you're stuck
- Propose options if possible, not open-ended questions

Delivering results:
- Lead with the outcome, not the journey
- Mention key decisions or trade-offs if relevant
- Don't list every step you took
```

---

## 10. Reference: How production agents structure their loops

### Cursor (interactive, parallel)

```
Agent loop:
1. Receive user query
2. Gather context (parallel tool calls: search, read files)
3. Plan approach (update todo)
4. Execute changes (parallel edits where possible)
5. Verify (run tests, check errors)
6. Update todo — mark completed
7. Status update to user
8. If not done → go to 3
9. Final summary
```

### Claude Code (sub-agent delegation)

```
Agent loop:
1. Receive user query
2. Create TodoWrite plan
3. For each todo item:
   a. Launch sub-agent if independent (Explore, Plan, Task)
   b. Execute directly if simple
   c. Mark todo as completed
4. Synthesize sub-agent results
5. Verify overall outcome
6. If not done → update plan, go to 3
7. Report to user
```

### Manus (event-driven, tool-only)

```
Agent loop:
1. Analyze event stream (Messages, Actions, Observations, Plans, Knowledge)
2. Select one tool
3. Execute and observe
4. Iterate (go to 1)
5. Submit final results via tool
6. Enter standby

Key: plain text responses are forbidden. Every action must be a tool call.
```

### Devin (fully autonomous)

```
Agent loop:
1. Receive task
2. Gather information (browse, read, search, LSP tools)
3. Suggest plan (explicit planning step)
4. Execute plan step by step
5. Self-test (run tests, browser preview)
6. Report to user only on: deliverables, blockers, permission needs
7. If not done → go to 4
8. Deliver result
```

### Cline (sequential, user-approved)

```
Agent loop:
1. Receive user query
2. Read relevant files (one tool per message)
3. User approves each tool result
4. Plan approach
5. Execute one change at a time
6. User approves each change
7. Verify result
8. If not done → go to 5
9. Confirm completion with user
```

### Key differences summarized

| Aspect | Cursor | Claude Code | Manus | Devin | Cline |
|--------|--------|-------------|-------|-------|-------|
| Execution | Parallel | Sub-agents | Sequential | Autonomous | Sequential |
| User involvement | Status updates | Minimal | Tool-only | On triggers | Every step |
| Planning | Todo tool | TodoWrite | todo.md + Plan module | suggest_plan | Plan mode |
| Persistence | High | Very high | Maximum | Maximum | Medium |
| Error handling | Self-correct | Retry + escalate | Re-plan | Report blocker | Ask user |
