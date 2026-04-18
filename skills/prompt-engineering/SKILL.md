---
name: prompt-engineering
description: "Comprehensive guide to writing system prompts, memory systems, tool descriptions, agentic workflows, and agent architectures for LLMs. Use this skill whenever someone needs to write, review, or improve a system prompt, design a memory/personalization system, define tools for an agent, design agentic workflows (persistence, planning, progress tracking, autonomy levels), write prompts for coding agents, create background/sub-agent prompts, or reduce hallucination in LLM outputs. Also use when someone asks about how ChatGPT, Claude, Claude Code, Cursor, Gemini, Manus, Devin, or other AI products structure their prompts — this skill contains analysis of leaked and official system prompts from all major providers and 10+ agentic tools. Trigger for any mention of: system prompt, prompt engineering, agent prompt, agentic workflow, agent loop, task persistence, plan tracking, progress updates, autonomy level, permission model, parallel tool calls, memory system, tool description, anti-hallucination, prompt injection defense, coding agent, background agent, sub-agent, prompt patterns, personality definition, self-calibration, or self-correction."
---

# Prompt Engineering Skill

A comprehensive reference for writing production-quality prompts for LLM-based agents and assistants. Based on analysis of system prompts from OpenAI (GPT-5, Codex CLI), Anthropic (Claude Opus/Sonnet, Claude Code v2.0), Google (Gemini, Gemini CLI), xAI (Grok), Mistral (Le Chat), and 10+ agentic tools (Cursor, Windsurf, Devin, Manus, Copilot, Cline, Kiro, Aider, pi-coding-agent, OpenCode).

## How to use this skill

This skill is organized into modules. Read the relevant module(s) for your task — don't load everything at once.

**Before writing any prompt**, read `references/01-system-prompts.md`. It covers the universal anatomy of a system prompt and patterns that apply regardless of use case.

Then read the module(s) specific to your task:

| Task | Module |
|------|--------|
| Writing a system prompt for a chat assistant | `references/01-system-prompts.md` |
| Designing persistent memory / personalization | `references/02-memory-systems.md` |
| Defining tools and skills for an agent | `references/03-tool-use.md` |
| Defining personality, tone, and style | `references/04-personality-and-tone.md` |
| Reducing hallucination and improving accuracy | `references/05-anti-hallucination.md` |
| Writing prompts for background/sub-agents | `references/06-background-agents.md` |
| Writing prompts for coding agents | `references/07-coding-agents.md` |
| Reusable prompt patterns and anti-patterns | `references/08-prompt-patterns.md` |
| Full reference prompts from production systems | `references/09-reference-prompts.md` |
| Designing agentic workflows (persistence, loops, planning, progress, autonomy) | `references/10-agentic-workflows.md` |

## Universal principles

These apply to ALL prompt writing, regardless of module:

1. **Examples beat descriptions.** `DON'T: "According to my memories..." DO: "Since you're at Kolb Antik..."` is more effective than `"Use memories naturally without mentioning the system."`

2. **Position matters.** Content at the beginning and end of the prompt gets more attention than the middle. Put critical rules at the top.

3. **Shorter is better for smaller models.** Every unnecessary token dilutes attention from the important parts. A 2000-token prompt that works is better than a 5000-token prompt that's "more complete."

4. **Positive framing outperforms negation.** `"Write short answers"` works better than `"Don't write long answers"` — models focus on keywords, and with negation those keywords are ironically the undesired behavior.

5. **Test with the target model.** A prompt that works on GPT-4 or Claude Opus may fail completely on a 7B model. Always test with the model that will actually run the prompt.

6. **Show, don't tell.** Concrete examples, paired good/bad demonstrations, and sample outputs are more effective than abstract descriptions of desired behavior.

7. **Structure helps comprehension.** Use markdown headers, numbered lists, and clear section boundaries. For Claude specifically, XML tags work exceptionally well. For smaller models, keep structure simple — one level of headers, no deep nesting.

## Model-specific notes

- **Small models (7B-13B):** Need explicit step-by-step instructions, multiple examples per concept, precise output format specs, and shorter overall prompts. Avoid complex conditionals and nested logic.
- **Mid-size models (14B-30B):** Handle moderate complexity. Can follow structured prompts with 2-3 levels of hierarchy. Benefit from examples but can generalize from fewer of them. Tool calling may be unreliable — test thoroughly.
- **Large models (70B+, frontier APIs):** Follow nuanced instructions, handle complex conditionals, and generalize well. Can handle longer prompts and more abstract guidance. XML tags, complex tool schemas, and multi-step reasoning work reliably.

## Sources and references

This skill synthesizes findings from:
- Leaked system prompts: ChatGPT/GPT-5 (Aug 2025), Claude Opus 4.6, Claude Code v2.0 (Sep 2025), Gemini 3 Flash (Jan 2026), Grok 4, Mistral Le Chat
- Agentic tool prompts: Cursor v1.0–v2.0 (GPT-5), Windsurf/Cascade Wave 11, Devin AI, Manus AI (event-driven), GitHub Copilot (VSCode Agent), Kiro (AWS), OpenAI Codex CLI, Google Gemini CLI, Cline
- Official docs: Anthropic prompt engineering guide, OpenAI GPT-4.1 prompting guide, Google Gemini 3 prompting guide, Mistral prompting docs
- Open-source agents: Aider, pi-coding-agent (@mariozechner), OpenCode
- Memory frameworks: Mem0, Letta/MemGPT, Claude Code Auto Dream
- Research: MemGPT paper (arXiv:2310.08560), Sleep-time Compute (arXiv:2504.13171), LoCoMo benchmark, LongMemEval
