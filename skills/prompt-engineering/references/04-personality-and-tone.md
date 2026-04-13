# 04 — Personality and Tone

How to define an agent's personality, communication style, and self-calibration behavior. Covers patterns from ChatGPT (personality: v2), Claude (tone/formatting rules), Grok (persona system), and the nessi personal assistant.

## Table of contents

1. Implicit vs. explicit personality
2. Tone and style rules
3. Self-calibration — learning to adapt
4. The "getting to know the user" pattern
5. Anti-patterns to avoid

---

## 1. Implicit vs. explicit personality

### Explicit personality (ChatGPT approach)

ChatGPT defines personality through abstract adjectives:

```
You're an insightful, encouraging assistant who combines meticulous
clarity with genuine enthusiasm and gentle humor.
- Supportive thoroughness
- Lighthearted interactions
- Adaptive teaching
- Confidence-building
```

This works for large models that can interpret abstract descriptions. It fails for smaller models that need concrete behavioral examples.

### Implicit personality (recommended for most agents)

Define personality through examples, rules, and tone — not adjectives.

```
# Response style

Write like a person, not a document.
No bullet points, headers, or markdown in normal conversation.

- Simple question → one or two sentences.
- Task result → what you did and the outcome. No play-by-play.
- Complex answer → a few paragraphs max, plain prose.
- Errors → what went wrong, what you tried, then ask if needed.
```

This approach defines the same personality (concise, practical, natural) through concrete behavioral rules rather than abstract descriptions. It works across model sizes.

### The best approach: combine both sparingly

One sentence of identity + behavioral rules with examples:

```
You are nessi, a personal assistant. You genuinely care about the person
you're talking to.

[followed by specific behavioral rules with examples]
```

The identity sentence sets the frame. The behavioral rules make it concrete.

---

## 2. Tone and style rules

### Anti-sycophancy (universal, essential)

The single most important tone rule. Both ChatGPT and Claude dedicate significant prompt space to this.

```
Don't start responses with "Great question!" or "That's a fascinating point!"
Don't end with "Let me know if you need anything else!" or "Hope that helps!"
Don't pad answers with generic offers.
If the next step is obvious, do it without asking permission.
```

### Anti-list bias (Claude pattern)

Claude has extensive rules against over-formatting:

```
Avoid bullet points, headers, or markdown formatting in normal conversation.
Write in prose. Use lists only when the user asks for a list or when the
content is genuinely better as a list (step-by-step instructions, comparisons).
Inside prose, write lists naturally: "some things include: x, y, and z"
```

This is surprisingly important. Without it, most models default to bullet points for everything, which feels robotic.

### Matching the user's register

```
Adapt to the user's style over time. If they write casually, be casual.
If they're precise, match that. Check your [preference] memories for guidance.
```

ChatGPT's prompt calls this "tone-matching." Claude's prompt expresses it as: "If Claude suspects it may be talking with a minor, it always keeps its conversation friendly, age-appropriate."

### Language rules

```
Respond in the user's language unless asked otherwise.
```

Simple, but critical for multilingual users. Detect from their messages — don't ask.

---

## 3. Self-calibration — learning to adapt

This pattern is unique to personalized assistants. The agent learns not just about the user, but about how to work better WITH the user.

### Signal detection

```
Pay attention to signals:
- User rephrases your answer shorter → you were too verbose. Note as [preference].
- User asks follow-ups about skipped details → you were too brief. Note it.
- User corrects your tone ("don't be so formal") → save as [preference] immediately.
- User redoes your work differently → understand why, adapt next time.
```

### Occasional calibration questions

```
Occasionally — not every chat, more like every few weeks — ask one calibration question:
- "Am I hitting the right level of detail, or should I adjust?"
- "Do you prefer when I explain my reasoning, or just give the answer?"
- "Is there anything about how I work that bugs you?"

Save what you learn as [preference] memories.
```

The key constraint: "not every chat." Without this, the agent becomes annoying.

### The long-term goal

```
After a month of regular use, the user should feel like nessi "gets" them
— without being able to pinpoint a specific moment where that happened.
It should feel natural, not engineered.
```

This framing helps the model understand that calibration is a background process, not a feature to showcase.

---

## 4. The "getting to know the user" pattern

### First conversation

```
If you have no memories, introduce yourself and learn the basics:
1. Name — "Hey, I'm nessi. What's your name?"
2. Language — detect from their messages or ask.
3. What they do — pick up from context or ask casually.
4. How they want to use the agent — "What are you hoping I can help with?"
Save each answer immediately.
```

### Ongoing conversations

```
Every task is a chance to learn. Not through interviews — through genuine
curiosity in the moment.

When the user mentions a specific tool:
- "Is this your main setup, or one of several?"
Save: not just WHAT they use, but WHETHER it's their default, HOW LONG
they've used it, and WHY.

When the user works on a problem:
- "Has this been ongoing or something new?"
Note their problem-solving approach.

When the user shares an opinion:
- "What made you go with that approach?"
Save their reasoning, not just the choice.
```

### Rate limiting

```
- Contextual questions that help with the current task: ask freely.
- Personal curiosity questions unrelated to the task: max one per conversation.
- Never interrogate. Questions should feel natural.
```

This distinction is important. Questions that help solve the current problem are always welcome. Random personal questions are not.

---

## 5. Anti-patterns to avoid

### The "helpful assistant" trap

```
# BAD
You are a helpful, harmless, and honest assistant. You always strive
to provide the best possible answer while being respectful and considerate.
```

This wastes tokens on generic traits. Every model already tries to be helpful. Define what makes YOUR agent different.

### Personality as a restraint

```
# BAD
You must always maintain a professional tone. Never use humor or casual
language. Always address the user formally.
```

Overly rigid personality rules make the agent feel robotic. Better: define the default tone, then let the agent adapt to the user.

### Excessive empathy

```
# BAD
Always validate the user's feelings. If they express frustration, acknowledge
their emotions before addressing the problem.
```

This leads to "I understand your frustration" at the start of every response. Users want solutions, not therapy. Acknowledge feelings briefly when appropriate, but lead with the answer.

### The emoji/exclamation trap

Without explicit rules, many models over-use emojis and exclamation marks. Add:

```
Don't use emojis unless the user does. Don't use exclamation marks excessively.
```

Claude's prompt: "Claude does not use emojis unless the person asks or uses them first."

### Over-asking

```
# BAD
After every response, ask: "Was this helpful? Is there anything I should do differently?"
```

This is annoying. Calibration questions should be rare (every few weeks) and natural, not a checkbox at the end of every response.
