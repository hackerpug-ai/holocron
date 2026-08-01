# Holocron - Agent Rules

All project rules, domain experts, coding standards, and policies live in **RULES.md**.

> **Read [RULES.md](./RULES.md) for the full rule set.**

For Codex dispatch behavior, including ChatGPT-account runtime model overrides for project specialists, use the `Codex Runtime Overrides` section in [RULES.md](./RULES.md).

## Secret index

This is a value-free index. Never put secret values, tokens, passwords, or private keys in
`AGENTS.md`, `RULES.md`, source code, commits, or review artifacts.

### Canonical local sources

- `.env` — operator-local environment file; ignored by Git. Gate and restore commands must load it
  explicitly when live credentials are intended: `set -a; source .env; set +a`.
- `services/platform/config/secrets.yaml` — ignored application/operator secret store. Prefer an
  explicit `HOLOCRON_SECRETS_PATH` or `HOLO_SECRETS_PATH` when running from a worktree.
- `.env.example` and `services/platform/config/secrets.example.yaml` — templates only; they contain
  names/placeholders, not live credentials.
- `.tmp/**/restore-target.env` — generated ephemeral restore credentials; treat as sensitive and do
  not use as a substitute for the operator's live restore tuple unless the task explicitly requires it.

### Credential-bearing names in `.env`

`ANTHROPIC_API_KEY`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_API_TOKEN`,
`BACKUP_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_API_TOKEN`, `DEEPGRAM_API_KEY`, `DEEPSEEK_API_KEY`,
`ELEVENLABS_API_KEY`, `EXPO_PUBLIC_RN_API_KEY`, `EXPO_TOKEN`, `OPENROUTER_API_KEY`,
`R2_RESTORE_ACCESS_KEY_ID`, `R2_RESTORE_SECRET_ACCESS_KEY`, `R2_SCOPE_PROBE_IN_KEY`,
`R2_SCOPE_PROBE_OUT_KEY`, `YOUTUBE_API_KEY`, and `ZAI_API_KEY`.

Associated R2 connection identifiers in `.env` are `R2_ENDPOINT`, `R2_ACCOUNT_ID`, and
`R2_BUCKET_NAME`.

### Credential-bearing names in `secrets.yaml`

`DATABASE_URL`, `FLEET_KEY`, `HOLO_KEY_CONTROL`, `HOLO_KEY_MCP`, `HOLO_KEY_RN`, `MASTRA_API_KEY`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_RESTORE_ACCESS_KEY_ID`,
`R2_RESTORE_SECRET_ACCESS_KEY`, `R2_RESTORE_SESSION_TOKEN`, `R2_REPO_CIPHER_PASS`,
`RESTIC_PASSWORD`, and `TAILSCALE_AUTH_KEY`.

Associated R2 connection/policy names are `R2_ENDPOINT`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`,
`R2_CREDENTIAL_POLICY`, `R2_PGBACKREST_PREFIX`, and `R2_RESTIC_PREFIX`.

For Sprint 28 live restore validation, the required distinct tuple is
`R2_RESTORE_ACCESS_KEY_ID` + `R2_RESTORE_SECRET_ACCESS_KEY` (and optional
`R2_RESTORE_SESSION_TOKEN`). A root `.env` is not loaded automatically by the human-gate runner;
source it explicitly before dispatching a live gate.
