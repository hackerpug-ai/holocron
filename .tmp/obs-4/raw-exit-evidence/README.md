# Raw exit evidence — 2026-07-18T04:03:54Z
implementation_merge_commit: cc386d1ed743d8543e27d8a805d0b7bee6dc0f48
branch_tip_at_run: 05ad213efa8be16eb1968c9944125ea09451945e
all_exit_proofs_ok: True

| case | process_status | pipe_status | expect_nonzero | proof_ok |
|------|----------------|-------------|----------------|----------|
| deliberately-bad | 1 | 1 | True | True |
| known-good | 0 | 0 | False | True |
| deterministic-invariant-regression | 1 | 1 | True | True |
| invalid-config | 1 | 1 | True | True |
| machine-readable | 0 | 0 | False | True |
