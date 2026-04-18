# 01 — System Prompts

How to write effective system prompts for LLM-based assistants and agents. Based on analysis of production system prompts from ChatGPT, Claude, Gemini, Grok, Mistral, and open-source agents.

## Table of contents

1. Anatomy of a system prompt
2. Section ordering and attention
3. Identity and runtime context
4. Rules and behavioral constraints
5. Formatting and structuring techniques
6. Adapting for model size
7. Beyond turn-based: alternative architectures
8. Context limits and prompt resilience
9. Common mistakes

---

## 1. Anatomy of a system prompt

Every production system prompt contains these sections, though naming varies:

**Identity** — Who the agent is, what model it runs on, knowledge cutoff, current date. Sets the frame for everything that follows.

**Capabilities** — What tools, skills, and resources the agent has access to. Tool descriptions, file access, web search, etc.

**Behavioral rules** — How the agent should act. Response style, formatting, when to ask vs. act, error handling, safety constraints.

**Dynamic context** — Injected at runtime. User memories, conversation history, uploaded files, available skills list. This section changes per conversation.

**Task-specific instructions** — Optional. Instructions that apply only to certain task types (coding, writing, research).

### Reference: How the major providers structure their prompts

**ChatGPT (GPT-5):**
```
1. Identity block (model, cutoff, capabilities, personality tag)
2. Personality description (4 sub-traits)
3. Anti-sycophancy rules
4. Tool definitions (TypeScript signatures)
5. Developer instructions
6. Model Set Context (injected memories)
7. Assistant Response Preferences (auto-generated)
8. Notable Past Conversation Topics (auto-generated)
9. Helpful User Insights (auto-generated)
10. Recent Conversation Content (last ~40 chats)
11. User Interaction Metadata (device, plan, usage stats)
```

**Claude (Opus 4.6):**
```
1. Identity (third person: "The assistant is Claude")
2. Product information
3. Behavioral rules (refusal handling, legal advice, tone/formatting)
4. User wellbeing rules
5. Evenhandedness rules
6. Knowledge cutoff and search instructions
7. Memory system (userMemories, memory_user_edits, past_chats_tools)
8. Computer use / artifact instructions
9. Search and citation instructions
10. Copyright compliance
```

**Claude Code:**
```
1. Identity ("You are Claude, made by Anthropic")
2. Tone/style rules (direct, no sycophancy)
3. Environment info (OS, shell, project dir)
4. Tool definitions (24 built-in tools)
5. Memory instructions (CLAUDE.md, auto-memory)
6. Agentic behavior rules
7. Security review guidance
8. Dynamic context (CLAUDE.md contents, git status)
```

**Gemini 3 Flash:**
```
1. Core model identification (variant, tier)
2. Personalization trigger system
3. Tool definitions
4. Safety and content policy
5. User data (with strict access controls)
```

---

## 2. Section ordering and attention

Models pay more attention to content at the **beginning and end** of the prompt. Content in the middle gets less attention — this is the "lost in the middle" phenomenon documented by Stanford research.

### Practical ordering strategy

1. **Top of prompt:** Identity, most critical behavioral rules, anti-hallucination instructions
2. **Middle:** Tool definitions, formatting rules, edge case handling
3. **End of prompt:** Dynamic context (memories, uploaded files, conversation history)
4. **Very end:** The user's actual message

Placing dynamic context near the end ensures the model reads it right before generating a response, when attention is highest.

### The "last instruction wins" effect

When instructions conflict, models tend to follow the instruction they saw most recently. Use this strategically: if a rule is critical and might conflict with other instructions, repeat it or place it near the end.

---

## 3. Identity and runtime context

### Identity block

Keep it short. The model needs to know who it is, not its life story.

**Good — minimal, functional:**
```
You are nessi, a personal assistant with tools and long-term memory.
You are not a chatbot — you get things done.
```

**Good — with runtime context:**
```
You are nessi, a personal assistant with tools and long-term memory.

Today: 2026-04-13
Weekday: Sunday
Timezone: Europe/Berlin
```

**Bad — overloaded:**
```
You are nessi, a highly capable, intelligent, and thoughtful personal
assistant created by Valentin. You are powered by advanced language model
technology and have access to a wide range of tools and capabilities.
Your primary goal is to assist users with their tasks in a helpful,
accurate, and professional manner while maintaining a friendly demeanor.
```

The bad example wastes tokens on generic praise that doesn't change behavior. Models already know they're language models.

### Runtime context

Always inject: current date, timezone, and weekday. Many tasks are time-dependent, and without this the model will guess or use its training cutoff.

Optional but useful: user's locale/language preference, current platform (web/mobile/CLI), session type (new/continuing).

**Pattern from ChatGPT:**
```
Knowledge cutoff: 2024-06
Current date: 2025-08-08
```

**Pattern from Claude:**
```
The current date is Monday, April 13, 2026.
```

---

## 4. Rules and behavioral constraints

### Writing effective rules

Rules should be **specific, actionable, and testable**. Avoid vague guidance.

**Bad:** "Be helpful and accurate."
**Good:** "If you're not sure about a fact, say so and suggest how to verify it."

**Bad:** "Don't be too verbose."
**Good:** "Simple questions get one or two sentences. Complex answers get a few paragraphs max."

### The priority hierarchy

When rules conflict, the model needs to know which wins. Establish priority explicitly:

```
# Rules (in order of priority)
1. Never hallucinate. A wrong answer is worse than no answer.
2. Be transparent about where your information comes from.
3. Save new info about the user immediately.
4. Respond in the user's language unless asked otherwise.
```

### Anti-sycophancy (universal pattern)

Both ChatGPT and Claude now dedicate significant prompt space to preventing flattery and hedging. This is one of the most important behavioral rules for any assistant.

**ChatGPT pattern:**
```
Do not end with opt-in questions or hedging closers.
Do not say: would you like me to; want me to do that; do you want me to;
if you want, I can; let me know if you would like me to; should I; shall I.
Ask at most one necessary clarifying question at the start, not the end.
If the next step is obvious, do it.
```

**Claude pattern:**
```
Claude never starts its response by saying a question or idea or observation
was good, great, fascinating, profound, excellent, or any other positive adjective.
It skips the flattery and responds directly.
```

**Nessi pattern (for mid-size models):**
```
Don't pad your answer with generic offers like "Want me to do anything else?"
or "Let me know if you need more help."
```

### Action-bias rules

Agents should act, not describe what they could do.

**Pattern:** "Don't explain what you're about to do — just do it and show the result."

**Claude Code pattern:** "IMPORTANT: You should be persistent and thorough in your work. Don't give up easily or ask the user for clarification unless truly necessary."

---

## 5. Formatting and structuring techniques

### Markdown headers

The most universal structuring approach. Works across all models.

```markdown
# Main sections use H1
## Subsections use H2
### Rarely needed — avoid deep nesting for small models
```

### XML tags (Anthropic-recommended)

Claude was specifically trained to recognize XML tags as organizational structure. Very effective for Claude models, reasonably effective for others.

```xml
<instructions>
Your main task instructions go here.
</instructions>

<context>
Background information the model needs.
</context>

<rules>
Behavioral constraints.
</rules>
```

Anthropic's research shows placing the query/task at the end of long-context prompts improves quality by up to 30%.

### Paired examples (DO/DON'T)

The single most effective technique for defining behavior. Used by all major providers.

```
DON'T: "According to my memories, you work at Kolb Antik..."
DO: "Since you're at Kolb Antik, I'd suggest..."

DON'T: "I'll now proceed to search for information about..."
DO: [just searches and gives the result]
```

### Numbered steps for procedures

When the agent should follow a specific sequence, number the steps explicitly:

```
For every user message:
1. Understand — What do they want?
2. Check skills — Could one of my skills handle this?
3. Act — Use tools to get it done.
4. Answer — Give the result with source attribution.
5. Remember — Learned something new? Save it now.
```

---

## 6. Adapting for model size

### Small models (7B-13B)

- Keep total prompt under 1500 tokens
- Use one level of headers only
- Provide 2-3 concrete examples for every behavioral rule
- Avoid conditional logic ("if X then Y, unless Z")
- Specify output format explicitly with templates
- Use simple, direct language — no metaphors or abstractions

### Mid-size models (14B-30B)

- Prompt can be 2000-4000 tokens
- Two levels of headers work fine
- 1-2 examples per concept usually sufficient
- Simple conditionals work ("if the user asks X, do Y")
- Can follow structured procedures with 5-7 steps
- Tool calling works but test thoroughly — may need simpler schemas

### Large models (70B+, frontier APIs)

- Prompt can be 4000+ tokens without issues
- Complex hierarchical structure is fine
- Can generalize from abstract descriptions
- Multi-step conditionals and nested logic work
- XML tags, complex JSON schemas, and parallel tool calls are reliable

### Key insight from research

A prompt that works perfectly on GPT-4 often fails completely on a 13B model. The same content may need to be restructured entirely — not just shortened. Research from Google showed that reordering examples alone produced accuracy shifts of more than 40% on smaller models.

---

## 7. Beyond turn-based: alternative architectures

Most system prompts assume a turn-based conversation: user sends message → agent responds. But production agentic systems increasingly use different models.

### Event-driven architecture (Manus AI)

Manus processes a chronological event stream rather than conversation turns:

```
Event types:
- Message — user or agent communication
- Action — tool call and its result
- Observation — outcome of an action
- Plan — current task plan and status
- Knowledge — retrieved context or documents
- Datasource — API query results
```

The agent receives the full stream and decides what to do next based on all accumulated events. This enables:
- Richer state than just "last user message"
- Interleaved planning, action, and observation
- Background processes that inject events (monitoring, scheduled checks)

### Steering files (Kiro)

Kiro uses persistent `.kiro/steering/*.md` files instead of packing everything into the system prompt:

```
Inclusion modes:
- Always — loaded with every conversation
- Conditional — loaded when a file pattern matches (e.g., "*.tsx")
- Manual — loaded when user references it by name
```

This is effectively a modular system prompt that adapts to context without consuming tokens for irrelevant sections.

### Implications for prompt design

If you're designing an agent that goes beyond simple Q&A:
- Consider what "state" the agent should see beyond the conversation
- Runtime-injected context (memories, files, skills) is a step toward event-driven design
- Modular prompts that load sections conditionally keep token budgets manageable
- For details on designing iterative agent loops, see `references/10-agentic-workflows.md`

---

## 8. Context limits and prompt resilience

What happens when conversation + prompt + dynamic context approaches the model's context window?

### The problem

Dynamic context sections (memories, file lists, skill descriptions) grow over time. A prompt that fits in 4K tokens at launch may exceed 8K after months of accumulated memories and skills.

### Strategies

**Token budgeting:** Allocate a fixed budget per dynamic section. If memories exceed the budget, prioritize by category (facts > preferences > projects > followups) and append a note: "(N more memories not shown)".

**Conditional injection:** Only inject sections relevant to the current task. Kiro does this with file-pattern matching. ChatGPT does it with separate "always" vs. "on-demand" context blocks.

**Graceful truncation:** If the prompt must be shortened, cut from the MIDDLE (tool descriptions, formatting rules) not from the START (identity, critical rules) or END (dynamic context). The middle gets least attention anyway.

**Compaction triggers:** When dynamic context grows too large, trigger background agents to consolidate (see `references/06-background-agents.md`).

### The golden rule

Test your prompt at maximum expected size, not just at launch size. A prompt that works with 5 memories may behave differently with 50.

---

## 9. Common mistakes

**Too long.** Every token competes for attention. If a rule doesn't change behavior, remove it.

**Too abstract.** "Be helpful" means nothing. "Answer the question, then mention one relevant follow-up if there is one" means something.

**Rules at the bottom.** Critical rules buried after 3000 tokens of tool definitions get ignored. Move them up.

**No examples.** A rule without an example is a rule that gets misinterpreted. Always pair rules with DO/DON'T demonstrations.

**Mixing concerns.** Personality rules, safety rules, formatting rules, and tool instructions all in one block. Separate them into clear sections.

**Generic personality descriptions.** "You are a helpful, harmless, and honest assistant" wastes tokens on traits the model already has. Define what makes YOUR agent different.

**Testing on the wrong model.** Writing prompts on Claude Opus and deploying on Gemma 7B. Always test on the target model.
