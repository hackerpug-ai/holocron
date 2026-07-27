# GATE-FIX-S26-03 seeded evidence

- Seed: `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod bun services/platform/src/cli/holo.ts seed:e2e --reset` (from monorepo root)
- Device: C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 (iPhone 17, booted)
- Metro: http://127.0.0.1:8081
- Platform: http://127.0.0.1:4111 (fleet :4545)
- Maestro: `.maestro/gate/step-5-idempotent.yaml` exit 0
- Oracles: pass-1 and pass-2 `Assert that id: upload-success is visible... COMPLETED`
- Screenshot: `gate-step-5-idempotent-resubmit.png`
- Postcondition: `holo verify:blob --last` → `file_objects rows: 1` (not 2)
- RED: prior step 5 `literal_cmd: null` + `wiring_gap_reason` + missing flow path (red-against-start.txt)
