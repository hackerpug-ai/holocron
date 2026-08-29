# HANDOFF — packages/ monorepo landed on main; secrets + live platform process not cut over

**Written** 2026-08-29T22:32:00Z by grok/grok-4.6
**Repo** holocron · **Branch** main · **HEAD** 0b2c99af
**How to use this**: read §1–§2, run the checks in §4, then start at §2.
Claims are labeled VERIFIED / CLAIMED / ASSUMED — re-verify anything not VERIFIED
before you rely on it. Raw evidence is in §10.

**Staleness**: §4 live-process check for TCP :4111 was last observed 2026-08-29T22:32:00Z
(`bun` PID 24230). Re-run `lsof -nP -iTCP:4111 -sTCP:LISTEN` before touching the
platform process.

## 1. Mission

Land Holocron’s installable modules under `packages/` (moderate scope: mobile, platform,
mcp, docs-reader, web). Code is on `main`. Remaining “done” work is operational: point
live secrets at `packages/platform/config/secrets.yaml`, stop the pre-move `:4111`
process, start from `packages/platform`.

**Out of scope**: turbo/nx; splitting Fulcrum into its own package; building a real web
client beyond `@holocron/web` placeholder; App Store / EAS / simulator UI; pushing to
`origin/main`; sprint human-test / E2E / red-hat gates (operator said skip verification).

## 2. Start Here

In the primary checkout `/Users/justinrich/Projects/holocron` (must be `main` @ `0b2c99af`
or a descendant):

```bash
# 1) Confirm the move is actually on this tree
test -f packages/mobile/app.config.cjs && test ! -f app.json && cat pnpm-workspace.yaml

# 2) Do NOT git stash pop stash@{0} — it overlaps dirty Fulcrum spec files in the WT
git stash list | head -3
git status --porcelain=v1 | head

# 3) Secrets cutover (names only — never print values)
# leftover local file (untracked): services/platform/config/secrets.yaml
# canonical after move:            packages/platform/config/secrets.yaml  (currently absent)
ls -l services/platform/config/secrets.yaml packages/platform/config/secrets.yaml 2>&1
```

Then: copy the leftover secrets file to the new path if the operator wants the platform
to boot with the old credentials; stop PID 24230 if it is still `holo.ts service:up` on
the deleted `services/platform/...` path; start with `bun packages/platform/src/index.ts`
(or `pnpm server:dev`) on a free port.

Do not `git add services/` — that tree is untracked leftover (`node_modules` + a
credential file).

## 3. State of Play

- Monorepo layout is on `main` — `VERIFIED` at 0b2c99af: `ls packages/` →
  `docs-reader mcp mobile platform web`; `test ! -f app.json`; workspace yaml is
  `packages/*` only; root `package.json` `start` is `pnpm --filter @holocron/mobile start`,
  no `expo` in root dependencies.
- Merge commit exists — `VERIFIED`: `git log -1 --oneline` →
  `0b2c99af merge: land packages/ monorepo (mobile, platform, mcp, docs-reader, web)`.
- Improvement tip is ancestor of main — `VERIFIED`:
  `git merge-base --is-ancestor a3468207 HEAD` succeeded.
- Live Expo config is `packages/mobile/app.config.cjs` (root `app.json` was an empty
  `{expo:{}}`) — `VERIFIED` files exist; product `name`/`slug` holocron is `CLAIMED` from
  this session’s earlier `pnpm exec expo config --json` on the improvement worktree, not
  re-run after the merge onto prime.
- Unit tests 560 passed on the improvement tree before merge — `CLAIMED` by this session
  at commit `1312476b` / `b24bafc4`; **not re-run on prime after merge**. Check:
  `pnpm test:unit`.
- PKG-05 never had a separate reviewer session; operator skipped remaining gates —
  `VERIFIED` from operator message “skip verification and merge”.
- `tests/integration/**` still hardcodes `services/platform` in many files —
  `CLAIMED` by the mastra-reviewer session for PKG-04; check:
  `rg -l 'services/platform' tests/integration | wc -l`.
- Prime is **dirty** (Fulcrum PRD/task markdown + untracked leftovers) — `VERIFIED`
  porcelain in §10. This dirt is **not** the monorepo move; it is pre-existing spec WIP
  plus a failed stash pop overlap.

**Landed** (on `main`, newest first):

| SHA | Subject |
|---|---|
| 0b2c99af | merge: land packages/ monorepo (mobile, platform, mcp, docs-reader, web) |
| 106f740c | docs(prd): retarget web-client PRD to packages/web (already on main before merge) |
| a3468207 | style: biome-format tsconfig include array |
| b24bafc4 | style(PKG-05-MOBILE): biome on path-retargeted tests |
| 1312476b | feat(PKG-05-MOBILE): Expo → packages/mobile, thin root |
| 54fad674 | Merge PKG-04-PLATFORM |
| c35b5e73 | Merge PKG-03-MCP |
| 2c1411ad | Merge PKG-02-DOCS-READER |
| 2ca6eaa9 | Merge PKG-01-WEB |

**In progress**: secrets path cutover; replace the live `:4111` process; decide what to do
with dirty Fulcrum specs + `stash@{0}`. Sprint tracker under
`.spec/tasks/imp-migrate-repo-monorepo-structure-1788024693/` may still show PKG-05
Pending — `ASSUMED`; open `SPRINT.md` if closing the ticket.

**Broken**:

- Process 24230 still serves `:4111` from **deleted**
  `.../holocron/services/platform/src/cli/holo.ts` (started 2026-08-29 15:51 local).
- `packages/platform/config/secrets.yaml` does not exist on disk; leftover copy is
  untracked at `services/platform/config/secrets.yaml`.
- `git stash pop` of `stash@{0}` **failed** (overlap with dirty Fulcrum files). Stash
  still present.

## 4. Perishable — Check Before Touching Anything

Observed 2026-08-29T22:32:00Z unless noted.

**Live process (do not ignore):**

```
PID 24230  bun  /Users/justinrich/Projects/holocron/services/platform/src/cli/holo.ts service:up
LISTEN *:4111
cwd: /Users/justinrich/Projects/holocron
started: Sat Aug 29 15:51:18 2026
```

Re-check: `lsof -nP -iTCP:4111 -sTCP:LISTEN` and `ps -p 24230 -o pid,lstart,command=`.
No listener on 8081 / 4137 / 4138 at observation time.

**No merge in progress** — `VERIFIED`: no `.git/MERGE_HEAD`.

**Worktrees**: dozens still checked out (improvement WT, PKG-01..04 WTs, sprint-33, etc.).
The improvement WT is still at `a3468207` on
`improvement/imp-migrate-repo-monorepo-structure-1788024693-migrate-repo-monorepo-structure`.
Those checkouts did **not** move to `0b2c99af`. Do not `git worktree remove --force`.

**Stashes** (prime):

- `stash@{0}` `wip: pre-monorepo-merge prime dirty 20260829T222917Z` — created immediately
  before the merge to get a clean tree. `git stash pop` aborted; stash kept. Overlaps
  dirty `.spec/prds/fulcrum/**` files now in the working tree.
- Older stashes (`stash@{1}` PKG-01 rebase, lefthook backup, …) are unrelated; do not pop
  them for this work.

**Uncommitted work** — dirty tree, 31 porcelain lines, `VERIFIED` 2026-08-29T22:31:07Z.
Risk: another agent `git add -A` will scoop Fulcrum spec WIP + untracked `services/`
(contains a secrets file). Exact list:

Modified (23): all under `.spec/prds/fulcrum/` (README, technical-requirements, sprint-01
FUL-* task files, SPRINT.md). Diffstat: 1038 insertions / 992 deletions.

Untracked:

- `.spec/evidence/tool-audit-20260828T225757Z/`
- `.spec/prd/edge-mcp-route/`
- `.spec/prds/mk6-migration/cycle4-rerank-degraded-fix.md`
- `.spec/prds/mk6-migration/tasks/sprint-30-.../.gate-evidence/...`
- `.spec/prds/web-client/designs/`
- `.spec/reviews/red-hat-2026-08-26T0110Z.md`
- `design/manifest.json`
- `services/`  ← leftover `platform/config/secrets.yaml` (mode 600) + `node_modules`

Index is clean (`git diff --cached --stat` empty).

**origin**: `main...origin/main [ahead 85, behind 23]` — `VERIFIED` via `git status -sb`.
Do not `git pull`/`git push` without an explicit operator ask.

## 5. Decisions — Do Not Undo Without Reading

- **Moderate layout: every installable module under `packages/` including Expo** — operator
  binding `~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json`.
- **Do not land on `origin/main` during the sprint** — original run constraint. Operator
  later said “skip verification and merge”, interpreted as merge **local** `main` only.
  Push was not requested.
- **Live Expo config is `app.config.cjs`, not the 17-byte `app.json`** — moving only
  `app.json` would have produced a hollow `packages/mobile`. Also moved `index.js`,
  `global.css`, `tailwind.config.js`, `.rnstorybook`.
- **Workspace membership oracle is `pnpm list -r --depth -1` matching `@name@`**, not
  `pnpm list --parseable` and not `--depth 0`. `--parseable` prints filesystem paths
  (never `@holocron/web`); `--depth 0` is a dependency listing a root
  `"@holocron/web": "npm:ms"` alias can fake. A SPEC-REPAIR already landed that lesson
  for PKG-01 (`0e585ec8`).
- **Root `package.json` is orchestrator-only** — Expo scripts are
  `pnpm --filter @holocron/mobile …`. `expo` is a dependency of `@holocron/mobile`,
  not of root. Hoisted `node-linker` still puts Expo in root `node_modules`.
- **Fulcrum stays in-process inside `packages/platform`** — no `packages/fulcrum`.
- **`pnpm-lock.yaml` conflicts on parallel package moves** — resolve by `pnpm install`
  after both importers exist; do not hand-edit the lockfile.
- **Timeout types in RN files** — after Expo left root, `NodeJS.Timeout` vs `number`
  broke typecheck. Fixed with `ReturnType<typeof setTimeout>` in
  `packages/mobile/components/voice/VoiceControlBar.tsx` and
  `packages/mobile/lib/logging/LogWriter.ts`. Looks like a random type tweak; it is not.

## 6. Dead Ends & Traps

- **Tried**: `pnpm list -r --depth 0 --parseable | rg '@holocron/web'` as TC-2 —
  fakeable via `"@holocron/web": "npm:ms@2.1.3"` and also fails for an honest
  `packages/web` path. Use `--depth -1` and `@holocron/web@`.
- **Tried**: `merge-to-main.sh` from the improvement worktree — exits 13/15 because that
  checkout is not prime (`--git-dir != --git-common-dir`). Merge on the primary checkout
  with `git merge --no-ff`.
- **Tried**: `git stash pop` after merge — aborted; stash kept. Do not retry without
  inspecting overlap with current dirty `.spec/prds/fulcrum/**`.
- **Trap**: empty root `app.json` (`{expo:{}}`). Expo reads `app.config.cjs` first.
  Symptom: `expo config` shows a real app while `app.json` looks empty.
- **Trap**: tests that `join(process.cwd(), 'components', …)` or
  `import('../../../components/...')` after the Expo move. Unit lane globs were retargeted
  to `packages/mobile/{hooks,components}/**`; `@` alias is `packages/mobile`. Relative
  `../../lib` from `tests/lib` must be `@/lib/...`.
- **Trap**: `pnpm list -r --depth -1` still prints the root orchestrator `holocron@1.0.0`
  plus five packages (six workspace projects). The five product members are the ones
  under `packages/`.
- **Trap**: PID 24230 looks like a healthy platform. Its argv path
  `services/platform/src/cli/holo.ts` **no longer exists in git**. New work must start
  `packages/platform/src/index.ts` / `packages/platform/src/cli/holo.ts`.

## 7. Blockers

- Operator has not asked to push to `origin/main` (ahead 85 / behind 23).
- Operator has not said what to do with leftover `services/platform/config/secrets.yaml`
  vs missing `packages/platform/config/secrets.yaml`.
- Operator has not said whether to kill PID 24230.
- Sprint close (tracker / SPRINT.md PKG-05 status / improvement ticket) was not run
  after skip-verification merge.

Nothing is waiting on a missing credential *name*; the leftover secrets file exists
locally and must not be committed.

## 8. Map — Pointers, Not Payloads

| What | Where |
|---|---|
| Binding (moderate scope) | `~/.config/brain/improvements/imp-migrate-repo-monorepo-structure-1788024693.json` |
| Sprint files | `.spec/tasks/imp-migrate-repo-monorepo-structure-1788024693/` |
| Layout test | `tests/unit/monorepo-packages-layout.test.ts` |
| Package map | `AGENTS.md` § Package map (line 7) |
| Workspace | `pnpm-workspace.yaml` |
| Mobile package | `packages/mobile/package.json` (`@holocron/mobile`) |
| Live Expo config | `packages/mobile/app.config.cjs` |
| Platform entry | `packages/platform/src/index.ts` |
| holo CLI default | `bin/holo` → `packages/platform/src/cli/holo.ts` |
| Dockerfile COPY | `packages/platform/Dockerfile` |
| Path rewrite script | `scripts/rewrite-package-paths.sh` |
| Improvement WT | `/Users/justinrich/Projects/holocron/.claude/worktrees/imp-migrate-repo-monorepo-structure-1788024693-migrate-repo-monorepo-structure` |
| Sprint runner | `~/.grok/skills/kb-run-sprint/SKILL.md` |
| Goal plan (session) | `~/.grok/sessions/%2FUsers%2Fjustinrich%2FProjects%2Fholocron/01a04f20-61c9-7130-b098-15cd83027db8/goal/plan.md` |
| Scratch oracles | `/Users/justinrich/.cache/agent-scratch/grok-goal-b31f16272e08/implementer/` (session scratch; may be deleted) |

## 9. Environment & Bootstrap

**Build**: `pnpm install --frozen-lockfile` (refresh lock with unfrozen install only if
workspace members changed)
**Test**: `pnpm test:unit`  ·  **Typecheck**: `pnpm typecheck`
**Run mobile**: `pnpm start` or `pnpm --filter @holocron/mobile start` from repo root;
or `pnpm exec expo start` from `packages/mobile`
**Run platform**: `pnpm server:dev` → `bun packages/platform/src/index.ts`

This session on the **improvement worktree** (not re-run on prime after merge):

| Command | Result | Label |
|---|---|---|
| `pnpm test:unit` | 560 passed / 30 skipped / 88 files | CLAIMED (pre-merge WT) |
| `pnpm typecheck` | exit 0 after Timeout fix | CLAIMED (pre-merge WT) |
| `pnpm exec expo config --json` from `packages/mobile` | name/slug `holocron` | CLAIMED (pre-merge WT) |
| `expo start` ×2 | Metro “Waiting on http://localhost:8081”, project path `packages/mobile` | CLAIMED (pre-merge WT) |
| `bun packages/platform/src/index.ts` ×2 | Listening :4137/:4138; `/health` JSON `status: degraded` | CLAIMED (pre-merge WT) |

Credential **names** (never values): leftover file
`services/platform/config/secrets.yaml`; canonical
`packages/platform/config/secrets.yaml`; also `.env` at repo root. Platform health
probes Postgres (`DATABASE_URL`) and fleet `:4545`.

Constraints: never `--no-verify`; never create feature branches on the primary
checkout (worktrees instead); never put secret values in commits; network disruption
as a test technique is forbidden per `AGENTS.md`.

## 10. Evidence Appendix

Sweep at 2026-08-29T22:31:07Z unless noted. Primary checkout
`/Users/justinrich/Projects/holocron`.

```text
git rev-parse --short HEAD
0b2c99af

git branch --show-current
main

git status -sb | head -1
## main...origin/main [ahead 85, behind 23]

git log --oneline -15
0b2c99af merge: land packages/ monorepo (mobile, platform, mcp, docs-reader, web)
106f740c docs(prd): retarget web-client PRD to packages/web (post-monorepo layout)
a3468207 style: biome-format tsconfig include array after mobile path retarget
b24bafc4 style(PKG-05-MOBILE): apply biome fixes on path-retargeted tests
1312476b feat(PKG-05-MOBILE): move Expo to packages/mobile and thin the workspace root
54fad674 Merge PKG-04-PLATFORM: move platform (incl. Fulcrum) to packages/platform
6b178864 chore(imp-migrate-repo-monorepo-structure-1788024693): status sync — PKG-01/02/03 completed, PKG-04 in review
c35b5e73 Merge PKG-03-MCP: move @holocron/mcp-unified to packages/mcp
2c1411ad Merge PKG-02-DOCS-READER: move holocron-docs-reader to packages/docs-reader
719582ec chore(PKG-04-PLATFORM): stamp tdd lineage after GREEN
e9542970 feat(PKG-04-PLATFORM): git-mv platform to packages/platform and rewrite live paths
4f46d2f5 fix(PKG-03-MCP): resolve monorepo root for env/secrets after packages/mcp move
7db1dffb chore(PKG-03-MCP): stamp tdd lineage (RED→GREEN distinct commits)
5bc4d61f chore(PKG-02-DOCS-READER): stamp tdd lineage (RED→GREEN distinct commits)
b875899c feat(PKG-02-DOCS-READER): git-mv docs-reader into packages/docs-reader

git diff --cached --stat
(empty)

git stash list (first 6)
stash@{0}: On main: wip: pre-monorepo-merge prime dirty 20260829T222917Z
stash@{1}: On kb-run-sprint/imp-migrate-repo-monorepo-structure-1788024693/PKG-01-WEB: pkg-01 local before rebase
stash@{2}: lefthook auto backup
stash@{3}: On feat/qwen-extractor-role: task2-preserve-protected-artifacts
stash@{4}: On main: wip: park unrelated OBS spec edits before kb-improvement-plan
stash@{5}: On main: NOT goal-plan-writer: concurrent/pre-existing dirty tree stashed so blind precommit-gate can release. Restore: git stash pop. Plan lives outside repo at ~/.grok/sessions/.../goal/plan.md

git status --porcelain=v1
 M .spec/prds/fulcrum/08-team-contributions.md
 M .spec/prds/fulcrum/09-technical-requirements/00-architecture-decisions.md
 M .spec/prds/fulcrum/09-technical-requirements/01-architecture-posture.md
 M .spec/prds/fulcrum/09-technical-requirements/02-system-components.md
 M .spec/prds/fulcrum/09-technical-requirements/03-data-schema.md
 M .spec/prds/fulcrum/09-technical-requirements/README.md
 M .spec/prds/fulcrum/README.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-INFRA-001-provision-compliant-fulcrum-roles-on-both-inference-minis.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-INFRA-002-embed-the-fulcrum-litellm-router-in-the-platform-image.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-INFRA-003-verify-the-dossier-with-real-service-playback-and-evals.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-001-install-the-append-only-fulcrum-ledger-contract.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-002-decide-deterministic-claim-admission.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-003-enforce-provenance-independence.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-004-compute-the-deterministic-belief-score.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-005-compile-the-versioned-fulcrum-mission-contract.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-006-retrieve-one-governed-corpus-fetch-artifact.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-007-attest-every-fulcrum-inference-call-from-router-truthful-metadata.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-008-execute-the-typed-fulcrum-cycle.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-009-commit-the-cycle-atomically-and-replay-safely.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-010-render-the-committed-candidate-dossier.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-011-publish-and-embed-the-dossier-idempotently.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/FUL-PLAT-012-return-the-committed-dossier-through-the-fulcrum-cli.md
 M .spec/prds/fulcrum/tasks/sprint-01-produce-one-trustworthy-candidate-dossier-on-self-owned-inference/SPRINT.md
?? .spec/evidence/tool-audit-20260828T225757Z/
?? .spec/prd/edge-mcp-route/
?? .spec/prds/mk6-migration/cycle4-rerank-degraded-fix.md
?? .spec/prds/mk6-migration/tasks/sprint-30-cutover-rollback-drill-and-data-plane-point-of-no-return/.gate-evidence/red-test-flag-guard-1787611661-48714/
?? .spec/prds/web-client/designs/
?? .spec/reviews/red-hat-2026-08-26T0110Z.md
?? design/manifest.json
?? services/

git diff --stat  (summary)
23 files changed, 1038 insertions(+), 992 deletions(-)
(all under .spec/prds/fulcrum/)

layout
packages/{docs-reader,mcp,mobile,platform,web}
ROOT_APPJSON=no  MOBILE_APPJSON=yes  MOBILE_APPCONFIG=yes
OLD_PLATFORM_PKG=no  OLD_MCP_PKG=no
pnpm-workspace.yaml: packages: - "packages/*"
package.json name=holocron private=True main=None start='pnpm --filter @holocron/mobile start' expo_dep=False
AGENTS.md:7 ## Package map

live :4111 (2026-08-29T22:32:00Z)
PID 24230 bun .../holocron/services/platform/src/cli/holo.ts service:up
LISTEN *:4111  cwd=/Users/justinrich/Projects/holocron

leftover secrets
PRIME_LEFTOVER_SECRETS=yes  (services/platform/config/secrets.yaml mode 600)
PRIME_NEW_SECRETS=no

improvement WT
branch improvement/imp-migrate-repo-monorepo-structure-1788024693-migrate-repo-monorepo-structure
HEAD a3468207  (clean porcelain)
```

Worktree list is long (50+ checkouts). Full `git worktree list` from the primary
checkout; do not force-remove. Improvement-related:

```
/Users/justinrich/Projects/holocron  0b2c99af [main]
.../imp-migrate-repo-monorepo-structure-1788024693-migrate-repo-monorepo-structure  a3468207 [improvement/...]
.../PKG-01-WEB  6e320978
.../PKG-02-DOCS-READER  5bc4d61f
.../PKG-03-MCP  4f46d2f5
.../PKG-04-PLATFORM  719582ec
.../SPEC-REPAIR-PKG-01-TC2  0e585ec8
```
