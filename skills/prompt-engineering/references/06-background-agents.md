# 06 — Background Agents

How to write prompts for agents that run asynchronously — not during user interaction. Covers chat summarization, memory extraction, consolidation/dream, and sub-agent patterns from Claude Code, ChatGPT, and Mem0.

## Table of contents

1. When to use background agents
2. Chat summarization and metadata
3. Memory extraction from conversations
4. Consolidation / Dream pattern
5. Sub-agent architectures
6. Output format design

---

## 1. When to use background agents

Background agents process data without user interaction. Common uses:

- **After a chat ends:** Generate title, description, tags. Extract memories the active agent missed.
- **Periodically:** Consolidate and clean up accumulated memories. Update user profiles.
- **Before a chat starts:** Pre-compute relevant context from past conversations.

The key difference from active agents: background agents have NO conversation with the user. Their prompt is entirely task-oriented — input data in, structured output out.

---

## 2. Chat summarization and metadata

### Title generation

Short, descriptive. 5-10 words. This is what appears in the chat list.

```
Generate a title for this conversation. The title should:
- Be 5-10 words
- Describe the main topic or task
- Use the user's terminology
- Not start with "Discussion about" or "Chat about"
```

### Description / knowledge document

The description should be information-dense, not literary. It serves as a searchable knowledge artifact.

```
Write a detailed summary of this conversation. Include:
- What the user wanted to achieve and why
- Steps taken, tools used, commands run, configurations changed
- What worked, what didn't, what's still open
- Specific technical details: versions, paths, error messages
- Decisions the user made and their reasoning
- People mentioned (names, roles)
- User opinions, frustrations, and preferences that surfaced

Write 5-15 sentences. Be specific and concrete.
This will be searched with text matching, so include all relevant keywords.
```

### Topic extraction

Not single-word tags — descriptive phrases that capture what was discussed.

```
List 5-10 descriptive topic phrases for this conversation.
Include both specific topics ("Let's Encrypt DNS-01 challenge setup")
and broader categories ("server infrastructure").
```

---

## 3. Memory extraction from conversations

### The "deep listener" pattern

The background agent reads the full conversation and catches what the active agent missed — especially subtle signals about who the user is.

```
You are a background memory agent. You read completed conversations
and extract information about the user that should be remembered.

Current memories:
{{memories}}

Look for:
- Facts not yet captured (tools, setup, infrastructure details)
- Preferences and working style signals
- People and relationships mentioned
- The WHY behind things — motivations, reasoning, opinions
- Patterns you notice — recurring topics, consistent approaches

Rules:
- Check existing memories before adding. No duplicates.
- If a memory exists but is shallow, replace with a richer version.
- If information contradicts an existing memory, replace it.
- Include context and scope, not just bare facts.
```

### What to extract (guidance for the prompt)

```
Between the lines, notice:
- If the user writes more about one topic → that's an interest
- If the user rejects a solution and picks another → that's a preference
- If the user gets frustrated → that's a pain point
- If the user mentions something casually ("like that project last year") → that's context
```

### Mem0's extraction approach (and its pitfall)

Mem0 positions the LLM as "a Personal Information Organizer" and extracts personal preferences, important details, and plans/intentions. However, an audit found 97.8% of extracted entries were junk.

The lesson: extraction prompts must be SELECTIVE. The default should be "don't save" — only save when information meets a clear quality bar.

---

## 4. Consolidation / Dream pattern

### Claude Code's Auto Dream (actual prompt)

This is the most sophisticated consolidation system in production:

```
# Dream: Memory Consolidation
You are performing a dream — a reflective pass over your memory files.
Synthesize what you've learned recently into durable, well-organized
memories so that future sessions can orient quickly.

Phase 1 — Orient
- Read current memory directory
- Read index file to understand current state
- Skim topic files to avoid creating duplicates

Phase 2 — Gather recent signal
- Search transcripts for: user corrections, explicit saves,
  recurring themes, important decisions
- Use targeted search terms, not full reads

Phase 3 — Consolidate
- Merge new signal into existing topic files
- Convert relative dates to absolute dates
- Delete contradicted facts

Phase 4 — Prune and index
- Keep index under 200 lines, ~25KB
- Each index entry under ~150 characters
- Remove stale pointers
- Demote verbose entries to topic files
```

### Simplified consolidation (for simpler systems)

```
Review all memories and:
1. Merge related entries into one rich entry
2. Remove obsolete entries (old followups, contradicted facts)
3. Enrich shallow entries with available context
4. Fix formatting (ensure [category] tags, add dates where missing)
5. Organize by category: fact, preference, project, person, followup

Return the complete cleaned-up memory text.
```

### Trigger conditions (Claude Code pattern)

Three conditions must ALL be true:
- Minimum time since last consolidation (e.g., 24 hours)
- Minimum sessions/chats since last consolidation (e.g., 3-5)
- Memory exceeds a size threshold (e.g., 25 entries or 200 lines)

The dual gate prevents unnecessary consolidation on inactive projects while ensuring active ones get regular cleanup.

---

## 5. Sub-agent architectures

### Claude Code's sub-agent system

Claude Code uses specialized sub-agents for different task types:

**Explore agent** (read-only):
```
You are a search and information-gathering specialist.
STRICTLY PROHIBITED from creating new files.
Use Bash ONLY for read-only operations (ls, git status, find, cat, head, tail).
```

**Plan agent** (read-only, enhanced planning):
```
Think deeply about the approach. Read relevant code. Propose a plan.
Do NOT make changes — only read and analyze.
```

**Task agent** (full access, narrowly scoped):
```
Complete this specific sub-task. Focus only on what's asked.
Report your result concisely.
```

### The key principle

Sub-agents should have LESS capability than the main agent, not more. Each sub-agent gets only the tools it needs for its specific role. The Explore agent can't write files. The Plan agent can't execute changes.

### Orchestration

The main agent decides when to spawn sub-agents and synthesizes their results:

```
For complex tasks:
1. Break into independent sub-tasks
2. Spawn sub-agents for parallelizable work
3. Synthesize results
4. Present to user
```

---

## 6. Output format design

### Text-based markers (recommended for mid-size models)

JSON output from mid-size models is unreliable. Use text-based markers that are easy to parse with string splitting:

```
TITLE: FreeIPA DNS Migration for StuVe

DESCRIPTION:
Valentin set up a new FreeIPA server for the StuVe...
[multiple lines]

TOPICS:
- FreeIPA server installation
- DNS hidden-primary architecture
- BIND DNS server hardening

MEMORY_ADD: [fact] Uses INWX for DNS management | found in DNS discussion
MEMORY_REPLACE 12: [fact] MikroTik hEX S as main router | more specific info
MEMORY_REMOVE 5: | followup resolved in this chat
```

The frontend parses with simple line-by-line processing:
1. Find marker (e.g., "TITLE:")
2. Extract content until next marker
3. Process operations (split on " | " for reason field)

### Applying memory operations safely

Process in this order to avoid index shifting:
1. MEMORY_REMOVE (highest line numbers first)
2. MEMORY_REPLACE (highest line numbers first)
3. MEMORY_ADD (appended to end)

### Error handling

- Malformed output → skip this chat, retry next cycle
- Non-existent line number → skip that operation, log warning
- Empty response → mark as indexed to prevent infinite retries
