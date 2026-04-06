# 2.2 Type Safety Hardening (P1)

Eliminate `any` types in critical code paths to demonstrate Staff-level TypeScript proficiency.

## Acceptance Criteria

- [ ] AC-10: Zero `any` types in `convex/chat/agent.ts` — `ctx` typed as `ActionCtx`, LLM results typed with AI SDK types
- [ ] AC-11: Zero `any` types in `convex/chat/index.ts` — all handler contexts and parameters properly typed
- [ ] AC-12: All `status` fields in `convex/schema.ts` use `v.union(v.literal(...))` instead of `v.string()` with comments (at minimum: `researchSessions`, `deepResearchSessions`, `tasks`, `subscriptionSources`)
- [ ] AC-13: High-traffic `v.any()` fields in schema replaced with typed validators: `cardData`, `plan`, `findings`, `toolArgs`, `config` (at least the top 10 most-used)
- [ ] AC-14: `as any` casts in `hooks/useResearchSession.ts` replaced with proper `Id<"researchSessions">` types
- [ ] AC-15: `pnpm tsc --noEmit` passes with zero errors after all type changes
