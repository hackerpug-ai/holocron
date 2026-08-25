# Handoff — Deep research: holocron MCP service vs agent-driven skill (classic)

Date: 2026-08-24 19:15
Harness: pi (session: holocron repo, /Users/justinrich/Projects/holocron)
Status: READY TO RUN — the comparison has NOT been executed yet. All setup facts below were VERIFIED live (fleet, router, platform deploy, MCP flow, cmux topology) in the session that produced this handoff.

---

## 1. Goal

Run the **same deep-research topic** twice, on **two different engines**, then **qualitatively compare** the outputs:

- **Path A — Holocron service (the thing we're optimizing for):** the deployed research pipeline on the `holocron` device, invoked over MCP (`deep_research` tool). Server-driven, gated, evidence-led.
- **Path B — Agent-driven skill (the baseline, "what we are used to"):** the `/deep-research` skill running in an agent session (the classic in-harness mode — model-led decomposition, Jina/Exa ladder, quote-grounded findings, independence test, disconfirmation pass). This is what produced the good answer on the old cmux surface 62 ("OC | Deep research: best SLC restaurants").

**Topic (canonical, reuse exactly):** `best restaurants in Salt Lake City 2026`
**Mode/budget (match both sides):** depth-style, ~3 rounds/iterations, partial-on-budget-exhausted. Same topic, same intent — the only variable is the engine.

## 2. Why this exists (background)

The holocron service's `deep_research` MCP tool was broken on 2026-08-24 (output: `Admitted: false · missing-components · independent sources: 6` — actually 0 real evidence — raw source paste instead of synthesis). Root causes (ALL FIXED + DEPLOYED, verified):

1. Production router (`holocron:4545`) only defined `reviewer/implementer/qwen3-embedding` → synthesis/research and rerank calls 400'd ("Invalid model name").
2. `reviewer` pointed at an oMLX node that physically cannot host Qwen3.8-27B-8bit (minis' memory enforcer evicts the 27B when the 35B implementer is resident) → 404. Reviewer/research/rerank now live on the **laptop** fleet (128GB), per `~/models/fleet/fleet.json` / `~/models/DEVICES.md`.
3. Claim extraction ran under a 20s outer + 45s internal timeout with **uncapped output** (6–10K-token generations at 5–25 tok/s) → every extraction aborted mid-flight → definition-only fallback claims → gate found no mechanism component.
4. The implementer model (Qwen3.6-35B-A3B-MLX-8bit, lmstudio build) emits a multi-K-token "Here's a thinking process:" preamble that blew even a 4096-token cap → truncation mid-JSON. **Fixed by disabling thinking** (`chat_template_kwargs: { enable_thinking: false }` injected via `createFleetChatModel`).
5. Synthesis ran as a stale `convergent` role under a 45s outer cap with a 4096 default output cap → every synthesis aborted → raw-paste fallback. **Fixed**: uses the manifest `synthesis` role, 8192-token cap, 250s budget; entailment cap raised 90s→200s.

Fixes live in 4 commits on `main` (pushed to origin): `67e6d24a`, `8c14d188`, `26621188`, `c8c82414`. Mastra deployed at revision `c8c82414` (image `localhost:5000/holocron-platform@sha256:c589d0a29528c34d381b6c90c3d69b73bda61ae262caf66ef53bb901525d14d5`).

**Final verification run (service, pre-handoff):** session `01a03632-f023-7b64-ab7e-40ab97330127` — **zero pipeline gaps**, claims 13/13, entailment 103/103, rerank ✓, synthesis = real report ("Salt Lake magazine recognized Beirut Cafe as the Best Restaurant of 2026 … Eight Settlers Distillery opened February 9, 2026"), gate covered 2/3 components (`best-restaurants-salt-lake-city-2026`, `new-openings-2026`; missing `award-winning-dining`), 3 admitted evidence, 2 independent sources, stopReason `wall_budget`. The report is a genuine synthesis now — but thin (2 rounds, wall-budget stop) and the gate bit reads `admitted:false` for one uncovered component.

**So the comparison question is precisely:** service output is no longer *broken* — is it as *good* as the agent-driven baseline? Thin-but-correct vs rich-but-hallucination-prone? That's the qualitative judgment this handoff sets up.

## 3. Current system state (VERIFIED 2026-08-24 ~19:10)

### Fleet / router
- **Laptop** (`justinrich` mac, 128GB): oMLX `main:8003` serves [BAAI-bge-reranker-v2-m3-mlx-fp16, Devstral-Small-2505-4bit, Qwen3-Embedding-0.6B-4bit-DWQ, Qwen3.6-27B-MLX-8bit, Qwen3.6-35B-A3B-MLX-8bit]; oMLX `omlx-research:8004` serves [Qwen3.8-27B-8bit] (restarted with `--host 0.0.0.0` so the device's router can reach it; log `~/.omlx/logs/omlx-research-8004.log`).
- **Holocron device** (`holocron.tail011a51.ts.net`, ssh alias `holocron`): LiteLLM router `:4545` — `/v1/models` = `[implementer, qwen3-embedding, qwen3-reranker, research, reviewer]`. Mastra on `:44111` (health: `{"status":"ok","fleet":{"ready":true}}`), Postgres `:44112` (docker), zero-cache `:44113`, OTel collector (UNHEALTHY — see caveats), langfuse stack (telemetry stale, see caveats).
- **Minis** (inference1/inference2): serve implementer (Qwen3.6-35B) + embeddings at ~53 tok/s now (27B offloaded).

### MCP surface (the service Path A uses)
- Endpoint: `http://127.0.0.1:44111/mcp` on the device (also `https://holocron.tail011a51.ts.net:44111/mcp` over tailnet). Streamable HTTP, stateless (`initialize` returns no session header).
- Auth: `Authorization: Bearer <HOLO_KEY_MCP>` — read from device `~/Projects/holocron/services/platform/config/secrets.yaml` (key `HOLO_KEY_MCP`).
- Tools: `deep_research` (start; returns `sessionId`, `status: queued`, `pollAfterMs`, `estimatedMs`), `deep_research_result` (poll with `waitMs` ≤ 45000, `includeFindings`), `deep_research_control` (cancel/steer), `quick_research`, `search_research`, `get_research_session`, plus holocron store/search tools.
- The laptop harness may also have holocron MCP servers configured (`mcp__holocron_*` tools) — those hit the same device service.

### Dev repo / git warning
- Repo `main` = `c8c82414` (= origin/main). **A background bench agent on this machine periodically sets `.git/config core.bare=true` and adds stray commits — before any git op, run `git config core.bare false` and check `git status`; never `git reset` a stray chain, preserve it via `git update-ref refs/save/bench-tangle-<ts> <sha>` first.**

## 4. Comparison plan (exact steps)

### 4.1 One-time setup — cmux surfaces (workspace 6 = holocron)

Current topology: workspace `6` (holocron) has pane `pane:14` with surface `surface:18` ("OC | AI inference deals research"). Create two dedicated panes so both runs are visible side by side:

```bash
# Terminal pane for Path A (service) — right split
cmux new-pane --type terminal --direction right --workspace 6
# Terminal pane for Path B (agent-driven) — left split of a second pane
cmux new-pane --type terminal --direction left --workspace 6
# List refs afterwards; refs below assume the NEW panes (use actual refs)
cmux list-panes --workspace 6
cmux list-pane-surfaces --workspace 6
```

### 4.2 Path A — holocron service (via cmux terminal)

On the Path-A terminal surface, run the MCP client flow below (VERIFIED working in the fix session). It initializes, starts `deep_research` on the canonical topic, polls to completion, and prints the sessionId + gate. The resumer can run it against the device (ssh) or locally if the laptop can reach `holocron.tail011a51.ts.net:44111`.

```bash
# From the Path-A terminal surface:
ssh holocron 'MCP_KEY=$(python3 -c "
import re
raw = open(\"/Users/holocron/Projects/holocron/services/platform/config/secrets.yaml\").read()
m = re.search(r\"^HOLO_KEY_MCP:\\s*[\\\"\\x27]?([^\\\"\\x27\\n]+)\", raw, re.M)
print(m.group(1).strip() if m else \"\")
")
BASE=http://127.0.0.1:44111/mcp
# initialize
curl -s -m 10 -X POST "$BASE" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $MCP_KEY" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-03-26\",\"capabilities\":{},\"clientInfo\":{\"name\":\"compare\",\"version\":\"1.0\"}}}" >/dev/null
# start deep research (canonical topic)
curl -s -m 30 -X POST "$BASE" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $MCP_KEY" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"deep_research\",\"arguments\":{\"topic\":\"best restaurants in Salt Lake City 2026\",\"mode\":\"depth\",\"maxRounds\":3,\"onBudgetExhausted\":\"partial\"}}}"
# → note sessionId
# poll until completed:
curl -s -m 70 -X POST "$BASE" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -H "Authorization: Bearer $MCP_KEY" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":3,\"method\":\"tools/call\",\"params\":{\"name\":\"deep_research_result\",\"arguments\":{\"sessionId\":\"<SID>\",\"waitMs\":45000,\"includeFindings\":true}}}"
```

Then capture the artifacts:
- **Gate + gaps + components** (device):
  ```bash
  ssh holocron '/Applications/Docker.app/Contents/Resources/bin/docker exec -i holocron-production-postgres-1 psql -U holocron -d holocron -t -A -c "SELECT jsonb_pretty(plan->'"'"'gate'"'"') FROM research_sessions WHERE id='"'"'<SID>'"'"'; SELECT plan->'"'"'gaps'"'"' FROM research_sessions WHERE id='"'"'<SID>'"'"';"'
  ```
- **Report** (device): `SELECT document_id FROM research_sessions WHERE id='<SID>'` → `SELECT content FROM documents WHERE id='<DOCID>'` (or fetch via `mcp__holocron_get_document` if a laptop MCP server is configured).
- **Telemetry** (device): `SELECT role, step_id, status, count(*), round(avg(wall_ms)::numeric,0) FROM inference_telemetry WHERE session_id='<SID>' GROUP BY 1,2,3;` (column may be `run_id` on some builds — check `\d inference_telemetry`).

Alternative (harness-native): call `mcp__holocron_deep_research` / `mcp__holocron_deep_research_result` with identical args from the pi session — same device service, same session rows.

### 4.3 Path B — agent-driven skill (classic baseline, via cmux)

On the Path-B terminal pane, open an OpenCode agent surface and run the skill in **LOCAL mode** (true agent-driven baseline — NOT MCP passthrough):

```bash
cmux new-surface --type agent-session --pane <path-b-pane-ref> --provider opencode
cmux send --surface <path-b-surface-ref> '/deep-research "best restaurants in Salt Lake City 2026" --local'
# watch progress (repeat):
cmux read-screen --surface <path-b-surface-ref> --scrollback
```

Notes:
- `--local` is REQUIRED: without it, the skill may transparently delegate to the same holocron MCP pipeline, defeating the comparison. Verify the first ledger line of the run records `research_transport: LOCAL`.
- If the OpenCode agent-session surface type misbehaves, fall back to a plain terminal surface running `opencode` and typing the same command (or use `/deep-research` with `--local` in any harness).
- The classic run's output lands at `~/.holocron/deep-research/best-restaurants-slc-<date>/report.md` (plus findings/notes files in that dir).

### 4.4 Qualitative comparison (the deliverable)

Compare the two outputs on these axes; write a short comparison doc (e.g. `~/.holocron/comparisons/deep-research-holocron-vs-agent-20260824.md`) scoring each **Low/Med/High** with one evidence line each:

| Axis | What to look at |
|---|---|
| **Completeness** | Does it answer the full question? Components covered vs planned (service: gate coveredComponents/missingComponents; agent: its own decomposition). |
| **Depth & mechanism** | Does it explain *why/which qualify* (mechanism), not just name-drop (definition)? Service gate explicitly tracks definition vs mechanism components. |
| **Accuracy / source quality** | Quotes/urls traceable? Independent sources count (service: `independentSourceCount`; agent: cite count + diversity). Any invented facts? |
| **Narrative quality** | Categorized, layered report vs flat list vs raw paste. Compare against the surface-62 bar (headline + must-know tier + fine dining + ethnic + trending + explicit gaps). |
| **Verifiability / honesty about gaps** | Does it flag what it couldn't verify (service: gate reason + gaps array; agent: explicit gaps section)? No fabricated "2026 James Beard winner". |
| **Latency & cost** | Service: `estimatedMs`/wall clock + telemetry token counts. Agent: wall clock + model spend. Both: tool call volume. |
| **Reliability** | Service: gate admitted? (note: `admitted:false` for one missing component is a coverage matter, not a crash). Agent: any dead-ends/hallucinations? |

Then state the verdict explicitly: **is the service output at parity with the agent-driven baseline, better, or worse — and what's the smallest change to close the gap?**

## 5. Known caveats / gotchas

- **Service gate bit ≠ quality.** `admitted:false` with a `missing-components` reason is the gate being honest about uncovered components — judge the REPORT, not the bit. The 01a03632 run stopped at 2 rounds on `wall_budget`; a higher `maxRounds`/longer wall budget typically covers more components.
- **Wall budget:** depth runs stop when the round's wall budget is spent; don't mistake a `wall_budget` stopReason for a crash.
- **Device `edge` service is pre-existing-broken** (binds `127.0.0.1:44111` colliding with mastra; Tailscale Serve covers 44111). Irrelevant to MCP runs, but `deploy:apply` will always report an edge failure at the end.
- **Langfuse telemetry on the device is stale** (stored `LANGFUSE_AUTH_HEADER` → 401; collector drops traces; ClickHouse empty). Deferred — do NOT block on it for this comparison; `inference_telemetry` (Postgres) is the working telemetry source.
- **Repo git-state hazard:** background bench agent flips `core.bare` and adds stray commits — run `git config core.bare false` before git ops; preserve stray chains under `refs/save/bench-tangle-*`; don't `git reset --hard` anything that isn't clearly junk.
- **Machine load:** this mac runs a rogueone bench (load avg can hit 148–279) — `pnpm test:unit` has a flaky TC-17 under load (pre-existing); budget extra time for commits.
- **oMLX research model on laptop** (`:8004`) must stay up — if `deep_research_result` shows `synthesis/research` failures, check `~/.omlx/logs/omlx-research-8004.log` and the fleet status (`curl http://laptop.tail011a51.ts.net:8004/v1/models`).

## 6. Resume prompt (copy-paste for a fresh session)

```
Resume the deep-research comparison handoff in /Users/justinrich/Projects/holocron/.handoff/handoff-20260824-1915-deep-research-holocron-vs-agent-driven.md
(it is a VERIFIED, ready-to-run plan — do not re-investigate the fleet).

Run Path A (holocron MCP service, via cmux terminal surface) and Path B (/deep-research
skill in LOCAL mode via an OpenCode agent-session surface) on the SAME topic
"best restaurants in Salt Lake City 2026" with ~3 rounds each. Use the exact curl MCP
flow and cmux commands in section 4. Capture the service's gate/gaps/report/telemetry
from the device (research_sessions + documents + inference_telemetry) and the agent
run's ~/.holocron/deep-research/best-restaurants-slc-<date>/report.md.

Then write the qualitative comparison (rubric in section 4.4) to
~/.holocron/comparisons/deep-research-holocron-vs-agent-20260824.md with a verdict on
parity and the smallest change to close the gap. Report the comparison summary back.
Remember: git config core.bare false before git ops; device edge service broken is
pre-existing; judge reports, not gate bits.
```
