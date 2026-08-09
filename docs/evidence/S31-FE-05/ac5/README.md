# S31-FE-05 AC-5 — tip-bound Maestro cold-boot proof

## Tip
See `tip-sha.txt` (base product tip before this evidence commit; evidence commit is the successor binding junit+screenshots).

## Substrate
- Metro: worktree tip, `expo start --dev-client --clear` on :8081
- zero-cache: real on :4848 (`ZERO_ADMIN_PASSWORD=local-zero-admin`)
- Platform/Mastra: :4111 (health 200)
- Postgres: holocron_nonprod
- Device: iPhone 17 Pro simulator + Expo development client

## Seed
`seedE2eDatabase({ reset: false })` — `holo seed:e2e --reset` is blocked by `PONR_IMMUTABLE` on `data_plane_ponr`.

Stable IDs:
- research: `00000000-0000-4000-8000-e00000000033` (E2E Active Research: Native resilience)
- chat: `00000000-0000-4000-8000-0000000000e1` (E2E Conversation Alpha)

## Results
| Flow | JUnit | Result |
|------|-------|--------|
| `.maestro/research/session-loads.yml` | `session-loads.xml` | failures=0 |
| `.maestro/chat/send-streams.yml` | `send-streams.xml` | failures=0 |

## Oracles observed
- research-detail-view + topic (>=10 chars) + research-progress-bar
- chat-assistant-message-latest + assistant body >=20 chars
- zero Metro `Unable to resolve module` / red-screen (see `metro-module-resolution-scan.txt`)

## Scope expansion
Maestro yml under `.maestro/research/session-loads.yml` and `.maestro/chat/send-streams.yml` were minimally extended for honest AC-5 must_observe oracles (outside original writeAllowed list).
