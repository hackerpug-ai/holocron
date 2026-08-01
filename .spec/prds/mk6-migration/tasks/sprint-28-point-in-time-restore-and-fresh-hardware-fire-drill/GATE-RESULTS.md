# Gate Results: Sprint 28

## ✅ VERIFIED — recomputed pass equals claimed pass; 6/6 recomputed; 0 discrepancies

Proof: [`gate-verification.json`](./gate-verification.json)

- Date: 2026-08-01
- Run: `qa34-20260801T201647Z-baa1db93`
- Verdict: `pass`
- Exec pane: `surface:302 (C6DB434B-F37A-4072-821C-47A05B4980D7)`
- UI driver: `none` (all steps are terminal/operator flows)
- Machine verdict: [`gate-results.json`](./gate-results.json)

## Summary

| Result | Count |
|---|---:|
| Pass | 6 |
| Fail | 0 |
| Wiring gap | 0 |

## Per-Step Results

| # | Gate | Result | Evidence |
|---:|---|---|---|
| 1 | Real in-window `holo restore --pitr` into isolated scratch storage | ✅ Pass | [step1.log](./.gate-evidence/qa34-20260801T201647Z-baa1db93/step1.log) |
| 2 | Live prefix-scoped R2 read-only proof plus multi-axis mini isolation | ✅ Pass | [step2.log](./.gate-evidence/qa34-20260801T201647Z-baa1db93/step2.log) |
| 3 | Disposable fresh-target Docker restore and PostgreSQL row-count parity using only a verified read-only data tuple | ✅ Pass | [step3.log](./.gate-evidence/qa34-20260801T201647Z-baa1db93/step3.log) |
| 4 | Evidence-ledger as-of checksum parity | ✅ Pass | [step4.log](./.gate-evidence/qa34-20260801T201647Z-baa1db93/step4.log) |
| 5 | Blob SHA-256 parity with at least one matched object | ✅ Pass | [step5.log](./.gate-evidence/qa34-20260801T201647Z-baa1db93/step5.log) |
| 6 | Empty backup-chain negative control fails closed with no restored files | ✅ Pass | [step6.log](./.gate-evidence/qa34-20260801T201647Z-baa1db93/step6.log) |

## Remediation Validated During This Run

The original failure was a hybrid R2 credential tuple: the durable keypair from `.env` was combined with an unrelated session token from `secrets.yaml`. Restore tuple loading is now source-atomic. The durable token was also bucket-wide, so gate steps 2 and 3 now mint two short-lived read-only Cloudflare tuples: an exact `pgbackrest/` proof tuple and a separate fire-drill data tuple restricted to `pgbackrest/`, `recovery-baselines/`, and `restic/`. The runner independently proves the data tuple can read those prefixes and cannot put or delete its sacrificial object, then passes only that tuple to the fresh-target child. The former writer-credential fallback has been removed. Credential values were never written to gate evidence.
