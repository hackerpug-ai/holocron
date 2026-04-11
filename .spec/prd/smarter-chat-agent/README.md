# Smarter Chat Agent — PRD

Make the holocron mobile chat agent decide intelligently when to converse, when to ask clarifying questions, when to research, and when to produce a savable document — closing the gap with ChatGPT/Claude on intent detection and response routing.

## PRD Metadata

| Field | Value |
|-------|-------|
| Version | 1.0.0 |
| Appetite | 6 weeks (full polish) |
| Scope Level | full |
| Created | 2026-04-11 |
| Last Updated | 2026-04-11 |
| Status | Planning — ready for `/kb-project-plan` |

## Document Index

| File | Section | Stability |
|------|---------|-----------|
| [00-overview.md](./00-overview.md) | Product description, problem statement, solution | PRODUCT_CONTEXT |
| [01-scope.md](./01-scope.md) | In scope / out of scope | FEATURE_SPEC |
| [02-roles.md](./02-roles.md) | User personas | PRODUCT_CONTEXT |
| [03-functional-groups.md](./03-functional-groups.md) | 4 functional groups + UC summary | FEATURE_SPEC |
| [04-uc-int.md](./04-uc-int.md) | Intent Classification, Routing & Telemetry | FEATURE_SPEC |
| [05-uc-rec.md](./05-uc-rec.md) | Recommendation Engine + MCP Exposure | FEATURE_SPEC |
| [06-uc-clr.md](./06-uc-clr.md) | Clarification & Multi-Turn Coherence | FEATURE_SPEC |
| [07-uc-rel.md](./07-uc-rel.md) | Reliability, Activity & Document Discipline | FEATURE_SPEC |
| [08-team-contributions.md](./08-team-contributions.md) | Phase contributions from 4 planners | — |
| [09-technical-requirements.md](./09-technical-requirements.md) | Schemas, validators, prompts, components, build sequence | CONSTITUTION |

## Quick Stats

| Metric | Value |
|--------|-------|
| Functional Groups | 4 |
| Use Cases | 41 |
| Acceptance Criteria | ~180 |
| New Convex Files | 9 |
| Modified Convex Files | 8 |
| New React Native Components | 8 |
| New Hooks | 1 (required) + 1 optional |
| New MCP Tools | 1 (`findRecommendationsTool`) |
| New Schema Tables | 1 (`agentTelemetry`) |
| Schema Field Additions | 3 (on `conversations`) |
| Prompt Replacements | 3 (TRIAGE, RESEARCH_SPECIALIST, RECOMMENDATION_SYNTHESIS) |
| Eval Fixtures | 30+ |

## Anchor Failing Case

> User sends: `"career coaches for people with autism in San Francisco — provide 3-5 highly rated referrals"`
>
> **Today**: routes to `deep_research` → 3,000-word saved document about *how to think about finding a career coach* → no names, no contacts.
>
> **After this PRD ships**: routes to new `find_recommendations` tool → numbered list of 5 specific named coaches with phone, website, location, "why it fits" → inline in chat → no document created.

This is the canonical regression test. CI fails if it ever routes to `deep_research` again.

## Version History

| Version | Date | Changes | Trigger |
|---------|------|---------|---------|
| 1.0.0 | 2026-04-11 | Initial PRD synthesized from convex-planner, pi-agent-planner, frontend-designer, react-native-ui-planner | New initiative — failing case ("career coaches for autism") + user pain quote |

## Next Steps

1. `/kb-project-plan` — Convert UCs and the build sequence into Linear tasks
2. `/trd-plan` — Generate detailed Technical Requirements Document
3. `/kb-run-epic` — Execute task files in dependency order
4. Manual e2e verification: send the failing query in dev chat and observe the routing decision via the `agentTelemetry` table

## References

- Prior planning artifacts: `/Users/justinrich/.claude/plans/warm-imagining-bubble.md`, `/Users/justinrich/.claude/plans/warm-imagining-bubble-agent-a78c908c2fed4a210.md`
- Failing case context: original conversation analysis quoting ChatGPT/Claude routing patterns
