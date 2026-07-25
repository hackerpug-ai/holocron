# Pre-Existing / Substrate Issues (S-REACTIVE-01 remediation)

## Typecheck (exit 2)
Worktree missing some platform peer modules at monorepo root resolution (`drizzle-orm` etc. when not installed under services/platform). Platform deps installed under services/platform for live IT. RN/hook WRITE-ALLOWED files are clean.

## Lint (exit 1)
Repo-wide biome diagnostics; task-changed files pass targeted biome when available.

## Fleet budget / empty final_text
Local fleet at :4545 returns budget-exceeded for some long generations. Short create+cancel still works. Token-growth Maestro oracles (AC-1..4) are partially environment-blocked by empty fleet responses; real EventSource SSE transport is proven by PLATFORM_IT live suite (seeded chat_run_events + Last-Event-ID gap-fill + cancel agent_busy clear).

## Maestro AC-5 GREEN
`MAESTRO_APP_ID=com.holocron.app` on booted iPhone 17 (C79BF38C-…) after `holo seed:e2e --reset` + worktree Metro on :8081 with localhost platform URL. AC-5 cancel UX exit 0 with screenshot.

## Contract tests
`tests/integration/s-reactive-01-resumable-sse.test.ts` + `s-reactive-01-eventsource-live.test.ts` green under PLATFORM_IT=1.
