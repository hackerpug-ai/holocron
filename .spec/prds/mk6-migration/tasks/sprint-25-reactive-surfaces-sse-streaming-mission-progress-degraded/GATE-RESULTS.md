# GATE-RESULTS — sprint-25-reactive-surfaces

**verdict:** pass
**run_id:** s25-ht-20260725T203604Z
**written_at:** 2026-07-25T20:56:17Z
**steps:** 5/5 passed

Post-REDHAT-FIX-01..04 re-run on HEAD (cycle-2 G-2 close). This-cycle evidence under `.gate-evidence/`.

- Step 1: pass — Run holo seed:e2e --reset — seeds the Streaming conversation.
  - Evidence: `.gate-evidence/step-1-seed.log` — `seeded Streaming conversation + 2 messages`, `conversations: 5`
- Step 2: pass — Send 'Summarize the seeded doc'; stream tokens; airplane mid-stream; reconnect to exactly one final message (no dups).
  - Evidence: `.gate-evidence/step-2-4-reconnect.log` — token/lastSeq ≥3, `chat-assistant-bubble-count-1`, required `Streaming` COMPLETED
- Step 3: pass — Start a research mission — progress bar advances live as the workflow reaches iteration 3/5.
  - Evidence: `.gate-evidence/step-5-research.log` — `1/5` → `2/5` → `3/5` COMPLETED
- Step 4: pass — Update a seeded doc via the MCP gateway — the app reflects the new title within 5s via Zero.
  - Evidence: `.gate-evidence/step-6-mcp-p95.log` — Updated via MCP #1–#5 + assert-p95-slo COMPLETED
- Step 5: pass — Stop the local fleet then send a message — chat shows 'local fleet unavailable', not a spinner hang.
  - Evidence: `.gate-evidence/step-7-degraded.log` — envelope ROLE_UNAVAILABLE + Maestro banner COMPLETED
