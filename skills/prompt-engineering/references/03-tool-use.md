# 03 — Tool Use

How to define tools, skills, and capabilities for LLM agents. Covers tool description patterns from ChatGPT, Claude, Claude Code, Cursor, Windsurf, Aider, and pi-coding-agent.

## Table of contents

1. Tool description anatomy
2. Description patterns that work
3. When NOT to use a tool
4. Skill-awareness as an active thinking step
5. Error handling in tool descriptions
6. Adapting tool descriptions for model size
7. Parallel vs. sequential tool execution
8. Reference: How major providers define tools

---

## 1. Tool description anatomy

Every tool definition needs:

- **Name** — Short, descriptive. `web_search`, `memory_add`, `read_file`
- **Description** — What it does, when to use it, when NOT to use it
- **Parameters** — What inputs it takes, types, required vs. optional
- **Return format** — What the model gets back (even if implicit)

### Minimal example

```json
{
  "name": "web_search",
  "description": "Search the web for current information. Use when the question involves current facts, versions, or docs. Don't use for basic knowledge or the user's own files.",
  "parameters": {
    "query": { "type": "string", "description": "Search query, 1-6 words" }
  }
}
```

### Key insight

The **description field** is where most of the tool's effectiveness is determined. A good description tells the model not just what the tool does, but when to reach for it and when to use something else instead.

---

## 2. Description patterns that work

### Pattern: Include WHEN and WHEN NOT

```
Search the web for current information.

Use when:
- The question involves current facts, versions, release dates, or docs
- You're not confident in your training data on the topic
- You need to verify something before giving advice

Don't use when:
- You already know the answer reliably
- The question is about the user's own files or preferences
- The user is asking for your opinion
```

This pattern is used by Claude, ChatGPT, and Windsurf.

### Pattern: Pair with examples

```
memory_add(text) — Save a new memory line including [category] tag.

Example calls:
- memory_add("[fact] Name is Valentin")
- memory_add("[preference] Prefers concise answers for technical topics")
- memory_add("[followup - 10.04.2026] Ask about DNS migration status")
```

Examples are especially important for mid-size models that struggle to infer correct usage from descriptions alone.

### Pattern: Specify output format expectations

```
Returns a JSON object with:
- results: array of {title, url, snippet}
- total_results: number

The snippets are often truncated. Use web_fetch to get full content.
```

---

## 3. When NOT to use a tool

This is as important as knowing when to use one. Every unnecessary tool call adds latency and costs tokens.

### Anti-patterns to prevent

**Over-searching:** Agent searches the web for things it already knows. Fix with: "Don't search for basic programming concepts, math, or well-established facts."

**Redundant file reads:** Agent reads a file it already has in context. Fix with: "If the file content is already visible in the conversation, don't read it again."

**Memory saves for trivial info:** Agent saves one-time events. Fix with: "Don't save temporary states, individual tasks, or information findable via other tools."

### The "self-sufficiency check"

From OpenAI's GPT-4.1 prompting guide: "If you are not sure about file content or codebase structure, use your tools to read files and gather the relevant information: do NOT guess."

The flip side: if you ARE sure, don't waste a tool call verifying what you already know.

---

## 4. Skill-awareness as an active thinking step

Many agents have access to skills or plugins but forget to use them because the skill list is at the bottom of the prompt, far from the task instructions.

### The active check pattern

Insert into the agent's task flow, BEFORE the action step:

```
Before acting, scan your available skills.
Could one of them handle this task or part of it?
If yes, use it. If unsure, read its documentation first.
```

This single instruction dramatically increases skill usage.

### The missing skill pattern

```
If you think a skill would be useful but don't have one for the task,
mention it: "I don't have a skill for X, but I could try doing it
with bash / a different approach."
```

This surfaces gaps the user can fill by adding skills.

---

## 5. Error handling in tool descriptions

### Pattern: Built-in recovery instructions

```
bash — Run shell commands.

If a command fails:
1. Try `<command> --help` to understand the correct syntax
2. Check if the tool/binary is installed
3. If it's a permission issue, explain what's needed
4. Don't retry the same failing command more than twice
```

### Pattern: Graceful degradation

```
web_search — Search the web for current information.

If search returns no relevant results:
- Try a broader query (fewer terms)
- Try different terminology
- If still nothing, say what you searched and suggest the user try manually
```

### Claude Code pattern

```
If a tool call fails or produces an unexpected result, reflect on why.
Consider:
- Were the arguments correct?
- Is this the right tool for this task?
- Should I try a different approach?
```

---

## 6. Adapting tool descriptions for model size

### Small models (7B-13B)

- **Fewer tools.** 3-5 max. More tools = more confusion.
- **Shorter descriptions.** 1-2 sentences per tool.
- **Fewer parameters.** Keep to 1-2 required params per tool.
- **More examples.** 2-3 concrete example calls per tool.
- **Simpler schemas.** Avoid nested objects, enums with many values.

### Mid-size models (14B-30B)

- **5-8 tools** work reliably.
- **2-3 sentences** per description, including when/when-not.
- **One or two tools vs. one tool with action parameter:** Test both. Separate tools are often more reliable because the model's tool selection is usually better than its enum selection.

### Large models (70B+)

- **10+ tools** are fine.
- **Full descriptions** with when/when-not, examples, error handling.
- **Complex schemas** with nested objects and conditional parameters.
- **Parallel tool calling** (supported by Claude Code, Cursor).

---

## 7. Parallel vs. sequential tool execution

This is a design decision with significant implications for speed, reliability, and complexity. See also `references/10-agentic-workflows.md` for the full agentic context.

### Why it matters

Cursor marks parallel execution as "CRITICAL INSTRUCTION" claiming 3-5x speed improvements. Cline deliberately uses sequential execution for safety and reviewability. The right choice depends on your agent's use case.

### When to instruct parallel

```
DEFAULT TO PARALLEL for independent operations:
- Reading multiple files simultaneously
- Searching in different directories
- Fetching multiple web pages
- Running independent checks or validations

Only use sequential when one operation depends on the result of another.
```

**Cursor's emphatic framing:**
```
CRITICAL INSTRUCTION: For maximum efficiency, whenever you perform
multiple operations, invoke all relevant tools concurrently.
```

### When to instruct sequential

```
Use sequential execution when:
- Each step depends on the previous result
- The user wants to review and approve each step
- Tool calls are expensive, risky, or destructive
- The model struggles with parallel tool schemas
```

**Cline's deliberate choice:**
```
You can use one tool per message, and will receive the result
of that tool use in the user's response.
```

### Model size guidance for parallel execution

- **Small models (7B-13B):** Don't instruct parallel. Most can't reliably generate multiple tool calls in one turn.
- **Mid-size models (14B-30B):** Test thoroughly. Some handle 2 parallel calls, more is unreliable.
- **Large models (70B+, frontier APIs):** Parallel is reliable and should be the default for independent operations.

### The hybrid approach (recommended for most agents)

```
Parallel for reads — searching, fetching, looking up.
Sequential for writes — creating, editing, deleting.
```

This balances speed (reads are safe to parallelize) with safety (writes need sequential verification).

---

## 8. Reference: How major providers define tools

### ChatGPT — TypeScript-style signatures

```typescript
type web = {
  search_query: (_: { query: string, qdf?: number }) => any;
  open: (_: { url: string }) => any;
};
```

### Claude — JSON Schema with rich descriptions

```json
{
  "name": "web_search",
  "description": "Search the web for current information...",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "..." }
    },
    "required": ["query"]
  }
}
```

### Claude Code — inline text descriptions

```
## Tools

### Bash
Execute shell commands in the user's environment.
- Each command runs in a new shell (no state persistence)
- Avoid interactive commands (vim, less)
- Prefer && for chaining
```

### Aider — no formal tools at all

Aider doesn't use a tool system. Instead, it defines a SEARCH/REPLACE text format:

```
To make changes, use SEARCH/REPLACE blocks:
path/to/file.py
<<<<<<< SEARCH
old code
=======
new code
>>>>>>> REPLACE
```

This works because the output is parsed by the harness, not by a tool-calling API. For mid-size models that struggle with JSON tool schemas, this text-based approach is worth considering.

### Pi coding agent — minimal tools, maximum clarity

Pi uses only 4 tools (read, write, edit, bash) with very short descriptions. The philosophy: "all the frontier models have been RL-trained up the wazoo, so they inherently understand what a coding agent is. There does not appear to be a need for 10,000 tokens of system prompt."

The tradeoff: works great for frontier models, may need more guidance for smaller models.
