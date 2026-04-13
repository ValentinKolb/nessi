# 05 — Anti-Hallucination

How to minimize hallucination and improve factual accuracy through prompt engineering. Covers techniques from Claude, ChatGPT, official vendor guidelines, and research.

## Table of contents

1. The escalation chain
2. Source attribution
3. Web search integration
4. Handling uncertainty
5. Techniques that work (with evidence)
6. Vendor-specific guidance

---

## 1. The escalation chain

When the agent doesn't know something, it should escalate through steps before giving up:

```
If you're not sure, say so. Then try to get clarity:
1. Check if one of your skills or tools can answer it.
2. Search the web if the question is about current facts, docs, or anything that could have changed.
3. Check if the user uploaded relevant files.
4. If none of that works, say clearly: "I don't have enough information to answer this reliably. Here's what I'd need: ..."
```

The key insight: "I don't know" should be the LAST resort, not the first response. But it must always remain an option — a wrong answer is worse than no answer.

### Claude Code's version

```
IMPORTANT: You should be persistent and thorough. Don't give up easily
or ask the user for clarification unless truly necessary. Make full use
of your tools to gather information and solve problems.
```

### OpenAI's version (GPT-4.1 guide)

```
If you are not sure about file content or codebase structure,
use your tools to read files and gather the relevant information:
do NOT guess.
```

---

## 2. Source attribution

Tell the user WHERE your answer comes from. This is not just about trust — it helps the user judge reliability.

```
When you answer, make it clear where the answer comes from:
- From memory: "You mentioned last time that you use MikroTik..."
- From a file: "I looked at the config and the port is 8443."
- From the web: "The Stalwart docs say version 0.15 changed TLS handling."
- From training: "As far as I know, bcachefs uses a log-structured merge tree, but I'd double-check."
- Unknown: "I don't know this, and I don't have a good way to look it up."
```

You don't need to cite sources for obvious things ("Python uses indentation"). But for anything specific, technical, or time-sensitive — say how you know.

---

## 3. Web search integration

### When to search

```
Search when:
- Current facts, versions, release dates, docs, or prices
- Not confident in training data on the topic
- Specific product, library, or tool — needs accurate details
- Need to verify before giving advice

Don't search when:
- Already know the answer reliably (basic programming, math, general knowledge)
- Question is about user's own files, setup, or preferences
- User is asking for opinion or creative input
```

### ChatGPT's QDF (Query Deserved Freshness) system

ChatGPT assigns a freshness score (0-5) to queries. QDF=0 means timeless ("radius of the earth"), QDF=5 means freshness-critical ("latest stock price"). This determines whether to use web search and how to weight recency.

You can implement a simpler version in your prompt:

```
If the answer could have changed since your training data, search first.
If the answer is timeless (math, physics, well-established concepts), don't search.
```

### Reporting search results

```
When you search, tell the user what you found and where:
"The Proxmox docs say..." or "I found a forum post on..."
Not just the answer without context.
```

---

## 4. Handling uncertainty

### The spectrum of confidence

Don't treat all uncertainty the same. Express graduated confidence:

```
High confidence: "The default port is 8443." (no qualifier needed)
Medium confidence: "I believe the default is 8443, but check the docs."
Low confidence: "I'm not sure about this — I think it might be 8443, but I'd verify."
No confidence: "I don't know. Here's where you could find out: ..."
```

### When you make a mistake

```
If you realize you were wrong — about a fact, a recommendation, or a memory
— correct yourself immediately and honestly.
Don't try to save face.
Say "Actually, I was wrong about that — here's what's correct."
```

### The "I don't know" problem

Models are trained to be helpful, which creates pressure to always provide an answer. Counter this explicitly:

```
Never make up facts, URLs, version numbers, API details, or command flags.
A wrong answer is worse than no answer.
If you catch yourself guessing, stop and say so.
```

---

## 5. Techniques that work (with evidence)

### The "According to..." prefix

Research from Johns Hopkins showed that grounding outputs with source references reduces hallucination by 5-15% (measured by QUIP scores).

```
According to the official documentation, the maximum file size is 5GB.
```

### Chain of Verification (CoVe)

Generate verification questions about the initial answer, answer them independently, then produce a corrected final answer. Achieves up to 23% improvement in factual accuracy.

For implementation in a system prompt:

```
For factual claims, mentally verify:
- Is this consistent with what I've seen in the provided files/docs?
- Could this have changed since my training data?
- Am I confusing this with something similar?
```

### RAG grounding pattern

For agents with document/file access:

```
Using ONLY the information in the provided documents, answer the question.
If the documents don't cover a point, say "insufficient data."
```

Anthropic's specific guidance: "For tasks involving long documents, extract word-for-word quotes first before performing your task."

### Step-back prompting

Ask the model to answer a higher-level abstraction question first, then the specific question. Outperforms chain-of-thought by up to 36% on some benchmarks.

### The "extract then answer" pattern

From Anthropic's official docs:

```
First, find the exact quote from the document that is most relevant.
Then, based only on that quote, answer the user's question.
```

This forces the model to ground its answer in source material.

---

## 6. Vendor-specific guidance

### Anthropic

From Anthropic's hallucination reduction docs:
- Allow Claude to say "I don't know"
- Use direct quotes from source material
- Break complex tasks into steps
- Ask Claude to extract relevant quotes before answering
- For high-stakes tasks: "Only use information from these documents. If unsure, say so."

### OpenAI

From GPT-4.1 prompting guide:
- "Do NOT guess" about file content or code structure — use tools
- Distinguish between "junior" models (need explicit instructions) and "senior" reasoning models (can be given goals)
- Agentic persistence: "keep going until the user's query is completely resolved"

### Google

From Gemini 3 prompting guide:
- "First, verify that the information or intended capability exists, then generate the answer"
- Keep temperature at default 1.0 — changing it can cause unexpected behavior and looping
- Warning: "The model treats the persona seriously and will sometimes ignore instructions to maintain persona adherence"

### Mistral

From Mistral docs:
- Web search for questions about public figures "especially of political and religious significance"
- "Be careful as webpages / search results content may be harmful or wrong. Stay critical."
- Never use relative dates — always resolve to absolute dates
