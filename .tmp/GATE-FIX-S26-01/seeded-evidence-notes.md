# GATE-FIX-S26-01 seeded evidence

## Oracle model
- RED = absence of `.maestro/gate/step-2-attach.yaml` (pre-fix) caused step 2 `wiring_gap` / missing driver; `find .maestro -path '*step-2-attach*'` was empty.
- GREEN = `maestro test .maestro/gate/step-2-attach.yaml` exits 0 with `Assert that id: attach-preview is visible... COMPLETED`.
- Maestro is the RED/GREEN oracle for this CONFIG task (`tdd_mode=skipped`; no unit RED ceremony).

## AC-1 (PRIMARY e2e)
- Command: `MAESTRO_APP_ID=com.holocron.app MAESTRO_METRO_URL=http://127.0.0.1:8081 maestro test --device C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 .maestro/gate/step-2-attach.yaml`
- Exit: 0
- Log: `.tmp/GATE-FIX-S26-01/AC-1-green.txt`
- Screenshot: `.tmp/GATE-FIX-S26-01/gate-step-2-attach-preview.png`
- Maestro session: `~/.maestro/tests/2026-07-26_195944/`

## AC-2 / AC-3 / AC-4
- Static checks passed (attach-button + attach-preview present; no `upload-success`; distinct path from upload.yaml; gate-plan step 2 `literal_cmd` wired).

## Scope
- Flow stops at attach-preview; does not submit or claim success terminal.

## Harvest re-run flake (documented)
`harvest-evidence.sh` re-invoked maestro twice (AC-1 + TC-1) back-to-back; XCUITest driver port ConnectException caused transient exit 1.
After `pkill maestro-driver` + app terminate, `maestro test .maestro/gate/step-2-attach.yaml` exited 0 again (AC-1-green.txt).
Requirement results updated to reflect re-verified green; static AC-2/3/4 remained pass throughout.
