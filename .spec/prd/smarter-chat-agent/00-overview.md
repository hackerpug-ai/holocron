---
name: Overview
description: Product description, problem statement, and solution summary for the smarter chat agent initiative
stability: PRODUCT_CONTEXT
last_validated: 2026-04-11
prd_version: 1.0.0
---

# Smarter Chat Agent — Overview

## Product Description

Holocron is a personal knowledge management mobile app (Expo / React Native + Convex backend + holocron MCP server). At its center is a chat agent that orchestrates 21 tools across 10 specialists — research, knowledge base, commerce, subscriptions, discovery, documents, analysis, improvements, planning, and conversational intent. The agent runs entirely on the user's behalf with no multi-tenant concerns.

This initiative makes that chat agent **decide intelligently** about three intertwined questions on every message:

1. **When to converse** vs invoke a tool
2. **When to ask a clarifying question** vs guess
3. **When to produce a savable document** vs answer inline

## Problem Statement

The current agent is **demonstrably dumber than ChatGPT and Claude** on these decisions. The user described it directly:

> "our main chat agent on mobile is really bad at deciding when to converse w the user, when to ask clarifying questions, when to perform research/deep-research specialist to answer question, when to not produce a savable doc vs just get information to answer the user. I like how gpt/claude works ... my knowledge agent seems demonstrably dumber."

### The canonical failure

User sends:

> `"career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals"`

**Today**: The triage classifier routes this to the `research` intent → research specialist picks `deep_research` → 5-iteration academic synthesis runs for ~60 seconds → creates a saved document with a 3,000-word essay titled "How to think about finding a career coach for autistic adults," containing zero named providers, zero phone numbers, zero contact info. The user opens Google instead.

**Why it fails**:
- The triage classifier has no concept of "query shape" (recommendation vs factual vs comprehensive vs exploratory) — only intent.
- The research specialist's prompt says "default to answer_question" but the LLM still picks `deep_research` because the words "highly rated" and "provide 3-5" *sound* comprehensive.
- The synthesis prompt for `answer_question` is generic ("be concise, 2-4 sentences") with no special handling for recommendation queries.
- There is no `find_recommendations` tool — the LLM has no "right shaped" tool to pick.
- `quick_research` and `deep_research` unconditionally create documents, polluting the user's KB with content they never asked to save.
- The agent never asks clarifying questions for ambiguous queries — it just takes its best guess and runs an expensive tool.
- Multi-turn requests lose intent — the user says "find me a coach," the agent asks "where?", the user says "SF", the triage classifies "SF" as conversation and forgets the original recommendation request.

### Other related failures

- `"What do you think of those?"` (after a research result is on screen) re-runs another web search instead of answering from context.
- `"Save the 5 therapists you just listed"` returns "I don't see therapists in our conversation" because the prior output wasn't structured as a list.
- `"Help me with autism"` triggers a full research cycle on a topic the user wasn't ready to commit to — they wanted to think out loud first.
- Vague queries like `"find me a coach"` produce a generic article about coaching instead of a "where are you located?" follow-up.

## Solution Summary

This PRD ships **seven coordinated improvements** across the Convex backend, agent prompts, mobile UI, and external MCP surface:

1. **`queryShape` field on the triage classifier** (`factual` / `recommendation` / `comprehensive` / `exploratory` / `ambiguous`). Single LLM call, single JSON output. Drives tool selection deterministically.

2. **New `find_recommendations` tool** — separate from `answer_question`, with its own name, description, and structured params (`query`, `count`, `location`, `constraints`). LLMs anchor on tool names more reliably than optional parameters; this is the highest-leverage intervention.

3. **Deterministic regex backstop** in `convex/chat/triageRegex.ts` — pre-filter that catches the highest-frequency failure pattern (recommendation queries drifting to `deep_research`) and overrides the LLM when they disagree.

4. **Clarifying questions via `directResponse` short-circuit** — when `queryShape === "ambiguous"`, the triage emits a one-sentence clarifying question in the same call. No new tool ceremony, no second LLM call. Hard cap at `clarificationDepth = 1` per conversation.

5. **Persistent `pendingIntent` on the conversation document** — deterministic state survives clarification rounds. Cleared on completion or high-confidence topic change. The user can answer "SF" and the agent continues the original recommendation request.

6. **Document discipline** — tools decide document creation, not specialist judgment. `answer_question` and `find_recommendations` never create documents. `deep_research` is gated on explicit user signal ("comprehensive", "deep dive", "save"). New `DocumentDisciplineFooter` component shows "Saved to KB" inline when a doc was created and offers a "Save this to KB" quick-action when not.

7. **Telemetry + eval harness** — new `agentTelemetry` table captures every routing decision. Eval harness runs 30+ canonical queries through the triage on every PR, gates prompt changes, and hard-asserts on the failing case (must route to `find_recommendations`).

## Out of Scope (deferred)

- Wiring up the orphaned `convex/research/specialists/service_finder.ts` (async ServiceReport mismatch with synchronous chat result_card pattern)
- Replacing `zaiFlash` or `zaiPro` with different LLM providers
- Multi-modal input (voice, image attachments to chat)
- Public-facing app hardening (RLS, multi-tenant, OAuth) — this is a personal app per CLAUDE.md
- Streaming token-by-token rendering of tool output (existing reactive pattern is sufficient)
- A new top-level `clarification` intent (using `queryShape: "ambiguous"` is cleaner)

## Success Definition

After this PRD ships, the agent must:

1. Route the canonical failing query to `find_recommendations` with `queryShape: "recommendation"` (CI hard-asserts this)
2. Achieve ≥ 90% routing accuracy on the 30+ eval fixtures
3. Never create a document for `answer_question` or `find_recommendations` results
4. Ask at most 1 clarifying question per turn, only on `queryShape: "ambiguous"`
5. Preserve intent across clarification rounds for at least 95% of multi-turn flows in the eval set
6. Render recommendation lists inline on mobile with tappable phone/website/location actions
7. Show document discipline UI (`DocumentDisciplineFooter`) on every applicable response

## How This PRD Was Built

Four planners contributed in parallel:
- **convex-planner** — backend implementation, validators, schemas, MCP exposure, telemetry, build sequence
- **pi-agent-planner** — agent intelligence, prompts, intent classification, multi-turn coherence, decision tables
- **frontend-designer** — visual design specs (RecommendationListCard layout, ClarificationMessage treatment, AgentActivityIndicator phases, DocumentDisciplineFooter)
- **react-native-ui-planner** — mobile component implementation tasks (TDD-ready specs with file paths, props, tests)

Their outputs were merged into 4 functional groups: **INT**, **REC**, **CLR**, **REL**. See `08-team-contributions.md` for the per-planner phase outputs.
