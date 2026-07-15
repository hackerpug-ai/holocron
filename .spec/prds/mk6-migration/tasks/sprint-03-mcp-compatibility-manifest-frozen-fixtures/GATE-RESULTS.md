# Gate Results: sprint-03-mcp-compatibility-manifest-frozen-fixtures

## ✅ VERIFIED — recomputed `pass` == claimed `pass`; 6/6 recomputed; 0 discrepancies

proof: `gate-verification.json` (deterministic recompute by `verify-gate-evidence.sh` — D1 coverage-parity, D2 cmd-fidelity, D3 exit+regex+trailer, D6 verdict-recompute, D7 no-test-suite)

- **Date:** 2026-07-14T20:49:17Z (run_id)
- **Sprint:** sprint-03-mcp-compatibility-manifest-frozen-fixtures
- **Commit under test:** `63500b5` (`63500b583ad1e1acd781618367976b66819e26cf`) on `main`
- **Environment:** macOS (Darwin 25.4.0), bun 1.2.19; 44 tools registered in `holocron-mcp/src/mastra/stdio.ts`
- **Exec pane:** `surface:167` (UUID `F2A2040A-EF92-4C03-B52F-56E71863889A`), workspace:4 / window:1 / pane:41 — a visible cmux split; every step ran the LITERAL documented `holo` command there, tee'd to durable per-step logs
- **QA provenance:** `qa_surface_id=926FD73C-D1A5-48A1-B14F-11B4CBDE64DD`, `qa_session_id=e2ee2a82-dfa5-4d89-ada4-8c0e51938158`
- **UI driver:** none (all 6 gate steps are terminal CLI actions; zero UI steps)
- **Video:** n/a (no UI steps)

---

## Summary

| Result | Count |
|---|---|
| ✅ Pass | 6 |
| ❌ Fail | 0 |
| 🔧 Wiring Gap | 0 |

**Verdict: PASS (VERIFIED).** All 44 live-registered MCP tool IDs resolve to manifest entries carrying frozen success/error fixtures; the completeness gate fails closed (exit 1) when a tool's fixture block is removed; every mutation tool carries a replay contract.

---

## Per-Step Results

| # | Gate step | Method | Result | Evidence (log) |
|---|---|---|---|---|
| 1 | `holo mcp:verify-manifest` → exit 0, "44/44 tools, both transports" | real-cli | ✅ pass | exit 0; `44/44 tools covered, both transports covered`; no Issues block — `step1.log` |
| 2 | Remove one tool's fixture block, re-run → exit 1 naming the tool | real-cli | ✅ pass | removed real `store_document_success.json`, bare re-run exited **1**: `43/44 tools covered` + `store_document fixtures missing`; fixture restored git-clean — `step2.log` |
| 3 | `holo mcp:manifest-schema store_document` → input/output schema + defaults | real-cli | ✅ pass | exit 0; `--- input_schema ---` (title/content required), `--- output_schema ---` (documentId/embeddingStatus), `--- defaults ---` (metadata.category=general, metadata.date=auto) — `step3.log` |
| 4 | `holo mcp:manifest-replay add_subscription` → frozen idempotency key + stored result | real-cli | ✅ pass | exit 0; `Idempotency key: ["sourceType","identifier"]`; `Stored result field: subscriptionId`; frozen replay fixture (`kg_replay_001`, `representative_example: true`) — `step4.log` |
| 5 | `holo mcp:verify-manifest --protocol` → pinned MCP 2025-11-25 both transports | real-cli | ✅ pass | exit 0; `Protocol: 2025-11-25`; `Transports: stdio, streamable-http`; `Stateless: true`; `No server sampling: true` — `step5.log` |
| 6 | `holo mcp:list-mutations` → mutating tools incl. store_document w/ replay contract | real-cli | ✅ pass | exit 0; `Mutation tools (21):` incl. `store_document` (idempotency_key `["title","content"]`, stored_result `documentId`); all 21 carry idempotency_key + stored_result — `step6.log` |

Every `literal_cmd` is a real production `holo` invocation — none is a wholesale test-suite call (D7 clean). Evidence logs carry the `@@GATE-META cmd_sha@@` header + `@@GATE-EXIT@@` trailer and were independently recomputed.

---

## Step 2 — Negative Control (how "remove a fixture block" was reproduced)

The documented human action ("Remove one tool's fixture block, re-run `holo mcp:verify-manifest`") was reproduced **live against current `main`**, not against a pre-baked committed fixture:

1. Backed up and `rm`'d the real `services/platform/tests/fixtures/mcp-manifest/store_document_success.json`.
2. Ran the **bare** `holo mcp:verify-manifest` (identical command form to step 1) in the exec pane.
3. Observed exit **1**, `43/44 tools covered`, and the named tool `store_document fixtures missing` (on both stdout Issues block and stderr).
4. Restored the fixture (`cp` back + `git checkout --`) and confirmed the working tree is git-clean (0 dirty entries).

This proves the completeness gate has real teeth: it fails closed the moment a registered tool loses its fixture block, and names the uncovered tool.

---

## Harness Finding (NOT a product defect — recorded for upstream fix)

**`~/.claude/skills/kb-run-human-tests/references/exec-step.sh` masks non-zero exit codes as 0 inside an interactive zsh cmux pane.**

- **Symptom:** the first run of step 2 recorded `.exit=0` even though the gate output already showed `store_document fixtures missing`. Trusting it would have fabricated a *false* step-2 failure (expected exit 1, "got" 0).
- **Root cause (empirically proven, not theorized):** the upstream wrapper `( $CMD ) > >(tee -a LOG) 2>&1; EC=$?` uses process substitution; under interactive zsh (job-control / `MONITOR` on) `$?` after that redirection reads 0 regardless of the command's real exit. Probe: `( sh -c 'exit 7' ) > >(tee ...) 2>&1; echo $?` → **0** in the pane, while the same command directly (`bun … mcp:verify-manifest` with the fixture missing) exits **1**, and the reliable pipe form exits **7**.
- **Product is correct and unstubbed:** `holo mcp:verify-manifest` genuinely returns exit 1 on a missing fixture (verified by direct invocation). No product source was touched.
- **Fix used for this gate:** a local corrected runner `exec-step-fixed.sh` (in the evidence dir) that replaces the exit capture with a real pipe + `pipestatus[1]` (zsh) / `PIPESTATUS[0]` (bash) / `$?` fallback, writing `.exit` last as the completion signal. Evidence format (cmd_sha header, GATE-EXIT trailer, assertion.json) is byte-compatible, so `verify-gate-evidence.sh` ran unmodified and returned `verified: true`.
- **Recommended upstream change:** patch `exec-step.sh` line 99 to the pipestatus form so future gate runs on interactive shells capture true exits. Until then, any `/kb-run-human-tests` run whose gate has a non-zero-exit step (negative controls especially) is at risk of a false verdict on that step.

---

## Artifacts

- Machine verdict: `gate-results.json` (`verified: true`, verdict `pass`)
- Proof: `gate-verification.json` (`{"verified":true,"claimed_verdict":"pass","recomputed_verdict":"pass","steps_planned":6,"steps_recomputed":6,"discrepancies":[]}`)
- Pre-execution manifest: `gate-plan.json` (6 steps, per-step literal_cmd + assertion specs)
- Per-step evidence: `/tmp/holocron-gate-sprint-03-mcp-compatibility-manifest-frozen-fixtures/step{1..6}.{log,exit,assertion.json}`
- Corrected runner + capture probes: same evidence dir (`exec-step-fixed.sh`, `probe*.log`)

## Wiring Gaps

None. All six documented human CLI actions executed against real product code at `63500b5`.
