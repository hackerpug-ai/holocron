---
stability: CONSTITUTION
last_validated: 2026-07-13
prd_version: 3.0.0
---

# External Dependencies

## Added / load-bearing

| Dependency | Role | Docs |
|-----------|------|------|
| PostgreSQL 18 (+ `pgvector`) | The single store + ledger; vectors (HNSW) + FTS + logical replication | https://www.postgresql.org/docs/ · https://github.com/pgvector/pgvector |
| Mastra (`@mastra/core`, `@mastra/pg`, `@mastra/mcp`) | Agent/workflow/tool platform; Postgres storage; MCP server; exact versions fixed by the Runtime Compatibility Lock | https://mastra.ai/docs |
| Drizzle ORM | Typed schema + migrations over Postgres | https://orm.drizzle.team/docs |
| Zero (Rocicorp) + `zero-cache` | Reactive read/write sync from Postgres to the RN app through declared query/mutate endpoints | https://zero.rocicorp.dev/docs |
| graphile-worker (or pg-boss) | Postgres-backed scheduler + leased durable queue (replaces 16 crons) | https://worker.graphile.org/ · https://github.com/timgit/pg-boss |
| LiteLLM router (`:4545`) + Qwen fleet | Local inference for all roles (`divergent`/`convergent`/`judge`/`embed`/`rerank`) under the versioned Fleet Role Manifest | `~/.lmstudio/RULES.md` (fleet spec) · https://docs.litellm.ai |
| `@ai-sdk/openai-compatible` | Provider binding for the fleet endpoints | https://ai-sdk.dev/providers/ai-sdk-providers/openai-compatible |
| Qwen3-Embedding (GGUF, llama.cpp `--embedding`) | Local 1024-dim embeddings (replaces Cohere) | https://github.com/QwenLM/Qwen3-Embedding |
| Langfuse (self-hosted) | OTel trace sink, LLM-as-judge evals, drift tracking | https://langfuse.com/docs |
| Jina / Exa | Web retrieval tools (research) — carried over | https://jina.ai · https://exa.ai |
| Cloudflare R2 (S3-compatible object storage) | Remote, off-mini backup repository for Postgres (pgBackRest) and the blob mirror; standing disaster-recovery target for UC-PLAT-06 | https://developers.cloudflare.com/r2/ |
| pgBackRest | Postgres continuous WAL archiving + full/incremental/differential base backups + point-in-time restore against an S3-compatible repo | https://pgbackrest.org/ |
| restic | Content-addressed, encrypted, incremental backup/mirror of blob storage to the remote bucket | https://restic.net/ |

## Kept as budgeted / optional-premium

| Dependency | Role | Policy |
|-----------|------|--------|
| `@ai-sdk/anthropic` (Claude API) | High-stakes escape hatch (Sonnet 5 / Opus 4.8) | Default-deny; budget-ledgered; declared steps only |
| `elevenlabs` | TTS narration | Optional premium; local TTS is the default path in later MK-VI phases |
| Deepgram (raw `fetch`) | Podcast transcription | Optional premium; local Whisper on the fleet default |
| `@ai-sdk/openai` (OpenAI Realtime) | Voice assistant | Optional premium; unchanged this migration |

## Removed at decommission

`convex`, `convex-helpers`, `@convex-dev/workflow`, `@convex-dev/workpool` (vestigial — unused), `convex-test`, `@ai-sdk/cohere`, `@supabase/supabase-js` (dead leftover), the `convex/browser` client in the MCP server, and all Convex env vars. The Convex cloud deployment is deleted last as a source-destruction step, after the data-plane point of no return and fresh recovery evidence.

## Platform notes / gates

- **pg-boss/graphile-worker on Bun** must be verified on real Bun in Sprint 0 (they ride `pg`; probable but unverified). graphile-worker is the primary; the other is the fallback. The compatibility lock records the selected exact version and real-Bun evidence.
- **Structured output** relies on LiteLLM passing `response_format: json_schema` to the fleet backend's constrained decoder (llama.cpp GBNF / vLLM xgrammar). A boot-time per-role capability probe selects constrained-vs-repair mode.
- **Postgres 18 `uuidv7()`** is native; if pinned to ≤17, use `pg_uuidv7` or app-generated ids.
- **Remote bucket provider:** Cloudflare R2 is primary (S3-compatible, no egress fees — relevant since a real restore drill egresses the full backup; consolidates with the vendor already hosting the public `/article/` surface). **Backblaze B2** is the considered alternative (also S3-compatible; cheaper raw storage, but weigh egress cost for full-restore drills). Bucket contents are encrypted at rest (provider default) plus pgBackRest repo-level encryption, since this is the one copy of the data that leaves the tailnet's Tailscale-ACL trust boundary.
