# Holocron Observability — Consolidated Assessment (4× langfuse-logging-planner fanout)

**Date** 2026-08-25 · **Repo ref** origin/main `14dfa263` · **Method** 4 parallel read-only audits:
P1 instrumentation (f05b7ba2) · P2 export pipeline/health (9ba3a935) · P3 deploy topology (70848d39) · P4 OBS-05/roadmap (06b87bad)
All file:line refs are against `origin/main` unless noted. Findings tagged [OBSERVED] / [INFERRED] in the source reports.

---

## Verdict

The observability **sink side is sound** (collector pipeline, durable queue, Langfuse config anchor, edge). The observability **event side is effectively dead and invisible**: the mastra→collector→Langfuse OTLP leg has never been wired in the deployed topology (soft failure, zero observable surface), and the instrumentation itself emits no complete trace for any user turn — chat is fully invisible, missions emit flat orphaned 2-span pairs, and HTTP emits nothing. Fixing the leg is a 2-line change; fixing the events layer is a focused instrumentation pass.

---

## P0 — Fix now

1. **Wire the dead OTLP leg** (P2 F1, P3 F1, P4 P0-1 — unanimous). Add to the `mastra` service env in `services/platform/deploy/compose/compose.yaml` (~line 112; also `compose.dev.yaml` which inherits the same dead leg):
   ```yaml
   OTEL_COLLECTOR_URL: http://otel-collector:4318/v1/traces
   OTEL_COLLECTOR_METRICS_URL: http://otel-collector:8888/metrics
   ```
   **Do NOT change `config.ts:91-95` defaults** (`127.0.0.1:14318/18888`) — they are load-bearing for the restore harness (`backup/langfuse-restore.ts:180-181` remaps `14318:4318`) and integration tests (`tests/integration/observability-otel-v4.test.ts:13-14`). Static, non-secret values; reachable on the internal net. Then re-stage/re-apply and **verify spans land** via Langfuse Observations API v2 (`GET /api/public/v2/observations?limit=1`) before treating it as done. Today only `MastraStorageExporter`→Postgres is a live span sink.

2. **Make export failure loud** (P2 F1/F4). The default server path builds `OtelExporter` with `logLevel:'error'` → the debug wrapper is never installed → failures vanish into OTel's silent retry/drop; `flush()` resolves regardless. Replace the silent exporter in `createObservability()` (`mastra.ts:48-63`) with the `HolocronOtelBridge`, or at minimum add structured `logger.warn` on every `flush()` failure path (fields: `exportFailureCode`, `lastError`, `collectorUrl`, `exportedEvents`) — incl. the bare `catch {}` at `mission/runtime.ts:3861-3866`.

3. **Fix the false-failure metrics probe** (P2 F4). Bridge `flush()` (`langfuse-exporter.ts:225-243`) fetches `otelCollectorMetricsUrl` (default `:18888` — wrong host+port, no ports published) *after* a successful otel flush, so every healthy mission/backup export is marked `LANGFUSE_UNREACHABLE`. Reorder: run the Langfuse v2 confirmation first; treat metrics-unreachable as a *warning*, not an export failure.

4. **Make the chat agent visible** (P1 F1/F3). Chat runs as a standalone `new Agent()` (`compat/cells/agent.ts:99-112`) never registered on the Observability-backed Mastra instance (`index.ts:77-90` has `agents: {}`); its model wrapper (`inference/telemetry.ts:648-707`) writes Postgres rows only. Register it so agent/tool/generation spans flow. Plus one root span **per mission run** wrapping all stages with real parent-child timing (`langfuse-exporter.ts:348-392` currently emits root+child with identical start/end times), unified traceId = `context.run.trace_id` (`mission/cycle.ts:462`).

5. **Harden `renderCompose` placeholders** (P3 F6). `production-release.ts:1002-1006` hard-forces only DEEPSEEK/JINA/EXA; ~20 other credential-shaped vars (`DATABASE_URL`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_CLICKHOUSE_PASSWORD`, `LANGFUSE_REDIS_AUTH`, …) can trip the credential-literal scan (`:494-504`) when live values leak from `.env` into the rendered compose, blocking legitimate stages. Mirror the DEEPSEEK/JINA/EXA pattern for all of them; the scan becomes a backstop.

## P1 — Next

6. **Surface export health** (P2 F2). `readExportHealth`/`probeQueueSaturation` (`export-health.ts:123-199`) have **zero production callers** (integration tests only). Register on `/health` (`http/health.ts` + `hono-app.ts:198-203`, exempt from scoped-key like `/health`) or a `GET /observability/export-health`; wire queue depth via `otelcol_exporter_queue_size` from the corrected URL; add the periodic end-to-end Langfuse probe (`langfuse-exporter.ts:260-269` already implements it).
7. **Retention/TTL** (P3 F4). No `LANGFUSE_DEFAULT_TTL` anywhere in `deploy/` → unbounded ClickHouse growth. Add `LANGFUSE_DEFAULT_TTL: "30"` (or 90) to the `x-langfuse-env` anchor (`compose.yaml:15-45`).
8. **Backup coverage** (P3 F5). `langfuse-postgres-data`, `clickhouse-data`, `minio-data` are outside the pgbackrest/restic topology (pgbackrest.conf has only `[main]`; restic mirrors platform blobs only). Add a `[langfuse]` pgbackrest stanza + cover clickhouse/minio; verify/fix the `44112` pgbackrest stanza vs the internal-only topology (edge publishes only `44111`).
9. **Correlation & context** (P1 F3/F4). Fix the invalid `chat:${runId}` traceId (`chat-runs.ts:231`) → valid 32-hex; set `sessionId` = conversationId/runId on spans; inject env context once at startup (allowlist already has `releaseSha`/`imageDigest`/`environment` at `config.ts:29-31`, never populated); attach token/cost to generations (usage only in Postgres today, `telemetry.ts:1003-1010`).
10. **OBS-05 sequencing + base-path side effects** (P4). The plan is correct and officially supported (build web from source with `NEXT_PUBLIC_BASE_PATH`; worker stays prebuilt — matches `observability-source-lock.json` `customBuildRequired: true`). But the plan **misses that the API also moves under the base path**: in the same release, collector `LANGFUSE_OTLP_ENDPOINT` → `http://langfuse-web:3000/observability/api/public/otel` (else OTLP 4xx = non-retryable → spans dropped) and the langfuse-web healthcheck → `/observability/api/public/health` (else unhealthy cascade holds the collector). Pin the edge matcher: `path_regexp ^/observability(/|$)` (Caddy `handle /observability` is prefix-based → matches `/observabilityevil`; AC-2 needs the mechanism, not just the requirement). Add external `NEXTAUTH_URL` (`https://holocron.tail011a51.ts.net:44111/observability/api/auth`) to runtime secrets + `production.env.example`; add sign-out to the browser E2E matrix (known base-path bug class, langfuse#12035). **The dead-leg fix (P0-1) is a missing dependency of OBS-05** — its E2E can pass on an empty console; verify live data first. SPRINT.md ledger (1/8) is stale — OBS-01/02/04 are landed.

## P2 — Polish

11. **Redaction tuning** (P1 F5). For this private single-user app, `[REDACTED]` bodies + 200-char truncation (`telemetry.ts:1053`) gut the only debugging surface. Keep Postgres redaction; allow full prompt/output on the Langfuse path (or raise truncation to full body). `HOLOCRON_ATTRIBUTE_ALLOWLIST` already keeps console structural (no body) — XSS surface stays low.
12. **Collector hygiene** (P2 F6, P3 P2). Drop the `debug` exporter from the production traces pipeline (`otel-collector-config.yaml:35-36,56`) — dumps every trace to stdout, firehose when Langfuse is down. Add mastra `depends_on` on the collector (`service_started`); consider probing `:13133` health_check instead of `--version`.
13. **Cleanup divergent paths** (P2 F5). Delete deprecated `LANGFUSE_EXPORT_FAILED` alias (`langfuse-exporter.ts:42-43`, used at `mission-research.ts:44,180`); re-point `mission/runtime.ts:3850` + `backup/span.ts` at `createOtelBridgeFromEnv`; replace the serial per-event `flush()` await loop with batching.
14. **Hono request spans** (P1 P1-4). Per-request root span + `traceparent` extraction/propagation middleware (`http/hono-app.ts:197-201`); enable `signals.logs` for error correlation.

## P2 — Cross-layer (keep separate, verified correct)

- Platform telemetry (Langfuse + Postgres `MastraStorageExporter` as source of truth) vs brain agent analytics (central-v2 DuckDB on inference1: who ran / protocol compliance / cost) is a **deliberate, correct boundary**; Braintrust rejection rationale sound. Single pane of glass: **not worth it** — different questions, data planes, hosts; a unified UI is a new product contradicting the single-user posture (P4).
- Optional P2: deep links agent-intel compliance rows → Langfuse trace via `runId`/`missionId`.

## Quick wins (highest value-per-line)

1. The 2-line compose env block (P0-1) — restores the entire Langfuse OTLP leg.
2. Bridge flush reorder (P0-3) — kills false `LANGFUSE_UNREACHABLE`.
3. `LANGFUSE_DEFAULT_TTL` one-liner in the anchor.
4. Delete the `debug` exporter line.
5. Fix `chat:${runId}` → valid traceId.
6. `environment`/commit metadata at mission/chat entry (allowlist ready).
