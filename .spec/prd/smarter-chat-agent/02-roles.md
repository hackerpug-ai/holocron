---
name: Roles
description: User personas and target use cases for the smarter chat agent
stability: PRODUCT_CONTEXT
last_validated: 2026-04-11
prd_version: 1.0.0
---

# Roles & Personas

## Persona 1: Justin — Knowledge Gardener (app owner)

**Role**: Power user, PKM obsessive, primary beneficiary of every design decision. Sole user of holocron — there are no other accounts.

**Goals**:
- Get specific, actionable answers on his phone during real life (errands, walking, waiting rooms)
- Capture referrals, tools, and names the moment he thinks of them — without wading through essays
- Build a durable knowledge base from research that *feels* worth saving, and skip the saving step for answers that are just answers
- Trust that the agent picks the right depth of work for the question (inline answer vs saved doc)

**Pain points with the current agent**:
- Asks `"career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals"` and gets a 3,000-word saved document about *how to think about finding a career coach* — no names, no phones. Rage quits, opens Google.
- Asks a follow-up like `"what do you think of those?"` and the agent searches the web again instead of reasoning over what's already on screen.
- Tries to clarify a vague query with `"find me a coach"` and the agent either dumps a generic article or hallucinates a city. No middle ground of "where are you located?"
- Says `"research X and save it"` and the agent sometimes just answers inline. Says `"explain X"` and the agent sometimes creates a doc anyway.

**How a smarter agent helps**:
- `recommendation` queryShape → `find_recommendations` → 5 named coaches with contact info, inline, no doc. Tap to call.
- `factual` queryShape for follow-ups like "what do you think of those?" → `conversation` intent, directResponse, zero tool calls.
- `ambiguous` queryShape on `"find me a coach"` → triage emits directResponse: "Where are you located?" — same turn, ~150ms, feels like ChatGPT.
- Explicit document signal (`"save"`, `"for later"`, `"thorough report"`) → doc created. No signal → inline only.

**Maps to queryShape distribution**: heavy `recommendation` and `factual`, occasional `comprehensive`, regular `ambiguous` (vague thoughts while walking).

---

## Persona 2: Marcus — Autism Parent Researcher (ambient use case)

**Role**: Dad of a newly diagnosed kid. Doesn't care how the agent works — cares whether the answer is useful on his phone at 11pm. (Stand-in for "Justin in mode where he's helping someone else", since holocron is single-user.)

**Goals**:
- Find the right therapists, schools, support groups — specific names, vetted, local
- Learn enough background to ask informed questions at appointments (factual, not comprehensive)
- Save the handful of things he'll actually reference later (IEP templates, intake checklists, doctor contacts)
- Avoid reading long documents on a phone screen at midnight

**Pain points with the current agent**:
- Every query — no matter the shape — returns a long wall of prose. He scrolls past it to find the two sentences he needs.
- "Best ABA therapists in Oakland" returns a general article about ABA therapy methodology. He already knows what ABA is. He wants names.
- "Help me understand sensory processing" gets treated as a research-and-save task and a document appears he has to go delete.
- He types `"save the therapists you just listed"` and the agent says "I don't see therapists in our conversation" because the prior output wasn't scannable as a list.

**How a smarter agent helps**:
- `recommendation` queries return a strict numbered list — therapists he can tap to call, no essays.
- `factual` queries answer in 3 sentences inline. No doc.
- `comprehensive` queries (which he rarely asks) create a doc — but only when he says "complete guide" or "deep dive."
- Follow-up `"save those 5 therapists"` → documents specialist extracts the prior list from conversation context and saves it.

**Maps to queryShape distribution**: heavy `recommendation`, occasional `factual`, rare `comprehensive`, some `ambiguous` ("help me with IEPs").

---

## Persona 3: Sarah — The Mobile Browsing User

**Role**: Casual mobile user who uses holocron in short bursts. Often just wants to explore or poke at an idea.

**Goals**:
- Scan AI news while commuting
- Ask quick "what is X" questions without any commitment
- Occasionally go deep on a topic and save something she'll come back to
- Have multi-turn conversations where each turn builds on the last (she hates re-explaining context)

**Pain points with the current agent**:
- Asks "what's trending in AI agents" and the agent creates a whats_new report — but then her follow-up "which of those is most interesting?" spawns another tool call instead of just answering from the report that's right there on screen.
- Mid-conversation, the agent forgets what they were talking about. She says "tell me more about the second one" and the triage classifies it as "conversation" with no context.
- She starts a research thread with "find me 3 good podcasts about AI safety", the agent asks "any particular angle?", she replies "just general", and the agent loses track of the original request entirely.

**How a smarter agent helps**:
- `exploratory` queryShape → routes to `whats_new` or `answer_question` with discussion-friendly output.
- Follow-up turns get classified as `conversation` with directResponse drawn from already-retrieved content. Zero unnecessary tool calls.
- `pendingIntent` persistence on the conversation doc keeps the original recommendation request alive across the "what angle?" → "general" clarification round.

**Maps to queryShape distribution**: heavy `exploratory` and `factual`, occasional `ambiguous`, rare `comprehensive`.
