# Pre-existing issues (OBS-04)

- `pnpm lint` exits 1 with ~555 warnings across the monorepo. OBS-04 commits only touch
  write-allowed paths and pass `lint-staged` / biome on staged files. Full-repo lint
  warnings are pre-existing and not introduced by this task.
- Hosted holocron-production `:44111` was never mutated. Proof used isolated compose
  projects + obs01-canary only. Never ran `docker compose down -v`.
