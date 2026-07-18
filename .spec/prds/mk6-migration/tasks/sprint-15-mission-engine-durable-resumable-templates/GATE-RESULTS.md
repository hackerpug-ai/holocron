# Sprint 15 Gate Results — Mission Engine

**Source head:** `0e91678ce34fb79ed35da25342a31356a0c11621`  
**Database:** real `holocron_nonprod` Postgres  
**Fleet:** real `http://127.0.0.1:4545`  
**Raw evidence:** `.tmp/sprint-15-human-gate-20260718/`

## Verdict

**PASS — all seven human steps passed.**

The gate used direct CLI, `curl`, `psql`, real Bun subprocesses, and the real fleet endpoint. It did not invoke a wholesale test suite as a substitute for human steps.

| Step | Result | Proof |
|---|---|---|
| G1 typed mission + provenance | PASS | echo registration/run JSON; fleet health and pinned provenance |
| G2 closed DSL/fleet fail-closed controls | PASS | three invalid registrations exit nonzero; no invalid rows |
| G3 checkpoint SIGKILL/resume | PASS | child exit 137; checkpoint 1 survives; resume attempt 2 completes |
| G4 atomic commit crash boundary | PASS | readiness marker; zero commit/event rows before resume; one each after resume |
| G5 exact-once replay | PASS | same key returns `replay: true` and original run ID |
| G6 budget termination | PASS | nonzero CLI exit with `budget_exceeded` and persisted usage |
| G7 authenticated HTTP control | PASS | real health; RN create/status/steer/verdict; control alias status; ordered events |

## Independent review

`.tmp/sprint-15-independent-review-final.md` reports PASS with zero CRITICAL/HIGH/MEDIUM findings. It independently reviewed source, migration, tests, docs, and the raw gate evidence.

## Verification

`gate-verification.json` recomputes the seven-step count, subprocess exit, checkpoint/resume, atomic rollback, replay, budget, real dependency health, owner scope, event ordering, and fail-closed controls. `gate-results.json` records each raw evidence set. `gate-plan.json` defines the non-wholesale, provenance-bound recipe.
