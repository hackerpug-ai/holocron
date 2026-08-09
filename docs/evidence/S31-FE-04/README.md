# S31-FE-04 — Live Maestro evidence (AC-4 / AC-5 / AC-6)

## Substrate
- Platform `:4111` healthy (queue degraded OK for chat path)
- zero-cache `:4848` keepalive OK (`ZERO_ADMIN_PASSWORD=local-zero-admin`)
- Metro `:8081` from this worktree (`expo start --dev-client --host lan`)
- Device: iPhone 17 Pro simulator `D70558B9-3E26-43F6-8D52-311A0D86E50D`
- Seed: `seedE2eDatabase({ reset: false })` (PONR blocks `--reset`)

## Results
| AC | Flow | Result | Evidence |
|----|------|--------|----------|
| AC-4 PRIMARY | `.maestro/reactive/conversation-switch-no-leak.yml` | PASS | `S31-FE-04-AC-4-conversation-B-no-leak.png` — B free of ZZTOPMARKER |
| AC-6 | same harness remount path | PASS | `S31-FE-04-AC-6-remount-rehydrate.png` |
| AC-5 | `.maestro/chat/send-streams.yml` | PASS | `S31-FE-04-AC-5-send-streams-prefix-collision.png` — QQPROBE + Q1/Q2 ids |

## Logs
- `maestro-conversation-switch-no-leak.log` (EXIT 0)
- `maestro-send-streams-ac5.log` (EXIT 0)

## Oracles
- AC-4: send ZZTOPMARKER on Alpha → navigate Beta → Beta seed visible, ZZTOPMARKER absent, busy-false
- AC-6: send RRPROBE → navigate B → A → RRPROBE accessibility label + assistant-latest + busy-false; Beta title absent
- AC-5: Q1/Q2 durable message ids visible as distinct bubbles; QQPROBE single accessibility bubble; assistant-latest
