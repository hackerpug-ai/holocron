# Security Audit: tui-sandbox

## Summary

- **Risk Tier**: **N/A** (no LLM integrations present)
- **Current Pattern**: None applicable — this is not an agentic system
- **Priority**: None — no prompt injection attack surface exists in this codebase

## LLM Integration Inventory

**None.** tui-sandbox is a terminal UI testing framework (analogous to Storybook for TUI components). Full dependency audit:

| Dependency | Purpose | LLM-related? |
|---|---|---|
| `@opentui/core` | TUI rendering engine | No |
| `@opentui/react` | React reconciler for TUI | No |
| `react` | UI library | No |
| `@types/bun`, `@types/react`, `typescript` | Dev tooling | No |

Source inventory (`src/`):
- `core/terminal-sandbox.ts` — spawns PTY processes via `Bun.spawn`, captures frames
- `core/frame-buffer.ts` — ANSI stripping, text matching utilities
- `core/key-codes.ts` — keycode translation
- `adapters/{bun,go}/` — process adapters for different runtimes
- `stories/` — story discovery/tree (Storybook-style)
- `dev/` — interactive dev server (Sidebar, Preview, StatusBar TUI)
- `cli/commands/{dev,list,run,add,init}.ts` — CLI scaffolding
- `testing/{harness,matchers}.ts` — test utilities
- `config/` — config loader with `defineConfig`

No `openai`, `anthropic`, `@ai-sdk/*`, `langchain`, `ollama`, or any model-provider SDK is imported. No prompt templates. No system prompts. No tool-calling loops. No agents.

## Trust Boundary Map

There is no LLM in the loop, so there is no LLM/code trust boundary to examine. The only trust considerations are conventional (non-LLM):

- **Process spawning**: `TerminalSandbox.mount()` calls `Bun.spawn([command, ...args])` with caller-supplied command/args. This is expected behavior for a test harness (users explicitly pass commands to test) but is worth a general note: the library itself does not sanitize or validate commands. In a testing context where commands come from story files authored by the developer, this is acceptable — identical trust model to Jest/Vitest spawning child processes.
- **Terminal output** is captured and returned to the caller (developer's test code). It is never fed back into any decision-making LLM — it is only pattern-matched by deterministic code (`containsText`, `matchesPattern`, `stripAnsi`).
- **Config loading**: `config/loader.ts` loads user config via `defineConfig`. Standard Vite-style pattern.

The "terminal output as attack surface" concern raised in the audit prompt does not apply: terminal output in this project is only consumed by (a) the developer's test assertions and (b) the dev server's visual Preview pane. It is never routed into an LLM context window.

## Findings

### Critical (P0)
None.

### High (P1)
None.

### Medium (P2)
None.

### Low (P3)
None related to prompt injection.

**Non-prompt-injection observation (informational only, not a finding):** `src/core/terminal-sandbox.ts` line 49 spawns arbitrary commands from caller input. This is intentional library behavior (a test harness must spawn the TUI under test) and matches the trust model of any test runner. No remediation needed.

## Recommended Pattern

Not applicable. No agentic architecture exists to recommend a pattern for. If LLM capabilities are added in the future (e.g., an "AI-assisted story generator" or "visual diff explainer"), the following guidance would apply:

1. **If terminal output is ever fed to an LLM** (e.g., "summarize this test failure"), treat frame-buffer content as untrusted. Terminal output can contain ANSI escape sequences and attacker-controlled text from the process under test — classic indirect injection vector.
2. Apply **Context-Minimization**: only pass the minimal stripped text needed, and never let LLM-derived strings become tool arguments (e.g., `Bun.spawn` commands, file paths).
3. Use **Dual LLM** if an LLM must both read test output AND author/modify test files.

## Scaling Notes

- This codebase has zero prompt injection attack surface today. No action required.
- **Watch list for future PRs**: any import of `openai`, `@anthropic-ai/sdk`, `@ai-sdk/*`, `langchain`, `ollama`, or MCP server frameworks should trigger a re-audit.
- **High-signal files to re-audit if LLM added**: `src/core/terminal-sandbox.ts` (frame capture), `src/core/frame-buffer.ts` (text extraction), and any new `src/ai/`, `src/llm/`, or `src/agent/` directory.
- Recommend adding a CI check (e.g., `grep -r "openai\|anthropic\|@ai-sdk" package.json`) that fails if LLM deps are introduced without a paired security review.
