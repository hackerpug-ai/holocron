# 2.4 Security Hardening (P1)

Remove dangerous unguarded mutations and fix the serverless rate limiter.

## Acceptance Criteria

- [ ] AC-23: All `clearAll` mutations across the codebase either removed or guarded with an admin check (environment variable guard at minimum)
- [ ] AC-24: In-memory rate limiter in `convex/research/rateLimiter.ts` replaced with database-backed rate tracking (following the pattern in `convex/synthesis/rateLimits.ts`)
- [ ] AC-25: `process.env = { ...process.env, ...Bun.env }` in `holocron-mcp/src/config/env.ts` replaced with targeted key merging
- [ ] AC-26: `searchResearch` tool's hardcoded `status: "completed"` replaced with actual session status
