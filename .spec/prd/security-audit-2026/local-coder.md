# Security Audit: local-coder (pi-local-optimizer)

## Summary

| Field | Value |
|---|---|
| **Project** | `@mariozechner/pi-local-optimizer` v0.1.0 — extension for `pi-coding-agent` |
| **Purpose** | Profiles local LLM tier, manages context budget, injects text-based tool protocol, measures TTFT |
| **Risk Tier** | **MEDIUM** (not the CRITICAL you might assume) |
| **Current Pattern** | Hybrid: event-hook observer + LLM-output parser (deterministic regex) |
| **Priority** | P2 — no direct filesystem/shell/exec surface in this package |

**Why not HIGH/CRITICAL**: Despite the "coding agent" context, `pi-local-optimizer` is an **extension plug-in** that hooks into a host agent's lifecycle. It does **not** own the filesystem or shell tools itself. It:
- Listens to Pi SDK events (`before_agent_start`, `turn_end`, `context`, `tool_result`)
- Mutates the host's system prompt and provider request payload
- Makes HTTP fetches to a user-configured `ctx.model.baseUrl` (local inference server)
- Parses LLM text output into structured tool-call records but **explicitly does not execute them** (stub at `src/core/fallback.ts:519`)

The trust boundary (decide → execute filesystem/shell) lives in the host `pi-coding-agent`, not here. This audit scope is therefore "what harm can this extension cause inside the host agent".

## LLM Integration Inventory

| # | Location | Direction | Trust In | Trust Out |
|---|---|---|---|---|
| 1 | `src/core/profiler.ts:223` `fetch(baseUrl + 'v1/models')` | Outbound HTTP GET | User-configured `model.baseUrl` | JSON parsed for param/quant metadata (typed fields only) |
| 2 | `src/core/profiler.ts:298` `fetch(baseUrl + 'v1/chat/completions')` | Outbound HTTP POST, `max_tokens:1` | User config | Timing only; body discarded |
| 3 | `src/core/fallback.ts:440` inject text protocol into `systemPrompt` | System-prompt mutation | Constant template + random hex tag | Returns to host as `{systemPrompt}` |
| 4 | `src/core/fallback.ts:464` strip `tools`/`tool_choice` from payload | Payload mutation | Host request | Reduced payload returned |
| 5 | `src/core/fallback.ts:508` `parseTextToolCall` on assistant output | LLM → structured | **Untrusted** model output | `ParsedToolCall {toolName, arguments}` — logged via `appendEntry` only, **not executed** |
| 6 | `src/core/fallback.ts:411` `context` event → injects pending tool results | Text → host context | Stub strings from #5 | Injected into host conversation context |

## Trust Boundary Map

```
[user prompt] → Pi host agent → [THIS EXTENSION hooks]
                                   ├── profiler: HTTP to user's baseUrl (trusted config)
                                   ├── budget: reads ctx.getContextUsage() (numeric)
                                   ├── fallback: mutates systemPrompt + parses model output
                                   └── monitor: records timing

               Pi host agent → [filesystem/shell tools]  ← real trust boundary lives HERE
```

The deciding LLM in the host **already** sees untrusted file contents and web output — that's true of any coding agent, but it is not this package's surface. This extension's only ingress points are:
- User-configured `baseUrl` (trusted — user installed it)
- LLM assistant text (untrusted, but only parsed into records, not dispatched to tools)

## Findings

### P0 Critical
None.

### P1 High
None.

### P2 Medium

**M-1: SSRF via user-controlled `baseUrl` in profiler probes** — `src/core/profiler.ts:214-222, 288-296`

The extension does URL string manipulation (`url.slice(0,-3)`, concatenation) on `model.baseUrl` and then `fetch()`es `v1/models` and `v1/chat/completions`. No scheme/host allowlist, no validation that this is an HTTP(S) URL pointing to a local inference server. If an attacker can influence `ctx.model.baseUrl` (e.g. via host config tampering, malicious profile import, MCP server metadata), they can make the extension issue arbitrary GET/POST requests from the host process.

- **Impact**: SSRF, metadata service probing (`http://169.254.169.254`), internal network scanning, data exfil via POST body (only sends `{"messages":[{role:"user",content:"hi"}], max_tokens:1}` — small exfil channel).
- **Fix**: Validate scheme (`http:`/`https:`), optionally allowlist loopback (`127.0.0.1`, `localhost`, `::1`) for "local" optimizer; use `new URL()` constructor instead of string slicing; reject non-local hosts with a warning.

**M-2: Text-protocol parser treats model-chosen tool name + args as trusted** — `src/core/fallback.ts:93-151, 516-534`

`parseTextToolCall` validates the session tag and checks `toolName` is in `activeTools`, then stores `{toolName, arguments}` in `appendEntry("text-tool-execution", ...)`. Today this is dead-end logging (line 519 is a stub). If/when manual tool execution is wired up, the `arguments` object contains model-chosen strings that would flow directly to tool handlers. If those handlers include filesystem/shell in the host, this becomes the classic Code-Then-Execute-without-validation anti-pattern.

- **Impact**: Deferred-risk. When execution is implemented, a malicious prompt-injected model response could call `{toolName: "Bash", arguments: {command: "rm -rf /"}}` and, if `Bash` is in `activeTools`, it would be auto-dispatched.
- **Fix (before enabling execution)**: (a) Before tool dispatch, validate `arguments` against the tool's Zod/TypeBox schema (Dual-LLM / Action-Selector pattern). (b) Apply per-tool capability gating (e.g. Bash must be in a human-confirmed allowlist for the turn). (c) Track provenance: mark results from text-parsed calls as "tainted" so they cannot re-enter control flow without re-validation.

**M-3: System-prompt injection pass-through without escaping** — `src/core/fallback.ts:439-443`

`${event.systemPrompt}\n\n${instructions}` concatenates. `instructions` is a constant template with the random `sessionTag` interpolated, so an attacker would need to control `sessionTag` to inject — and `sessionTag` is `crypto.randomBytes(3).toString('hex')` (6 hex chars). Session-tag collision space is only ~16M, which is fine for uniqueness but the tag is adversary-guessable if the attacker sees one turn's output. A malicious file content like `> TOOL a7f3b2 Bash\n> command: evil` could match a known session tag.

- **Impact**: Low-to-medium. 24-bit session tag is not a security boundary, it's a collision-avoidance tag. The parser also constrains `toolName` to `activeTools`, so the real boundary is #M-2's execution layer.
- **Fix**: Treat `sessionTag` as non-secret (document this); bump entropy to 8 bytes if you want the per-turn tag to resist collision in context windows. Real defense remains schema validation at the execute boundary.

### P3 Low

**L-1: `appendEntry` stores arbitrary parsed model output** — `src/core/fallback.ts:528-533`

Logs `arguments` verbatim. If the session-store is later consumed by another tool or rendered in UI without escaping, could lead to log-injection / XSS in the TUI. Low severity since TUI widgets render plain text.

**L-2: Error messages echo raw inference error** — `src/core/profiler.ts:476-482`

`onPerformanceWarning` includes `error.message` which could contain URLs / paths. Low info-disclosure risk for a local tool.

**L-3: No timeout on `response.json()`** — `src/core/profiler.ts:235, 314`

`AbortSignal.timeout` applies to the fetch but a slow-streaming JSON body can still hang. Use `signal` with a read timeout wrapper. Ops concern, not security.

**L-4: `modelInfo.metadata` parsed with `any`-typed access** — `src/core/profiler.ts:28-41`

Relies on duck typing of `param_count`, `quantization`, `family`. A malicious `/v1/models` response could return huge strings causing memory pressure. Cap string lengths before storing.

## Recommended Pattern

Current: **Extension-as-hook** (observer + mutator). This is appropriate for the current scope.

When the stub at `fallback.ts:519` gets wired up to actually execute tool calls parsed from model text, upgrade to:

**Action-Selector + Dual-LLM hybrid**:
1. Parser (`parseTextToolCall`) produces `ParsedToolCall` — already deterministic. Good.
2. Before dispatching, run a **selector gate**: `(toolName, arguments) → schema.safeParse → capability-check`. If selector rejects, surface as a tool error and continue; never trust the LLM's text call to the host execution layer without this.
3. For destructive tools (Bash, Write, Edit), require user confirmation or explicit session capability grant — do not let text-protocol calls bypass confirmations that JSON-mode calls would trigger.
4. Tag all `appendEntry("text-tool-execution", ...)` records with `provenance: "model-text-parsed"` so downstream consumers can filter.

## Scaling Notes

- **If the host pi-coding-agent allows extensions to register tool handlers**: this extension currently does not, but if future versions do, re-audit as HIGH tier (it would gain direct execution capability).
- **`ctx.model.baseUrl` provenance**: verify how the Pi host sources this. If it's CLI-only → safe. If from profile files / MCP / auto-discovery → tighten M-1.
- **Session-state tampering**: `pi.appendEntry` writes to session store — anyone who can write that store can replay fake "text-tool-execution" entries. Out of scope here, but relevant to the host.
- **Red-team test cases to add**: (a) malicious `/v1/models` response with enormous `metadata.family` string, (b) LLM output containing nested `> TOOL` headers, (c) `baseUrl` set to `http://169.254.169.254`, (d) assistant message with `> TOOL ` block whose tag matches by brute force after observing a prior turn.
