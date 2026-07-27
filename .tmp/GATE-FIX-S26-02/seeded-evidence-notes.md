# GATE-FIX-S26-02 seeded evidence

- Seed: `bun services/platform/src/cli/holo.ts seed:e2e --reset` (from monorepo root; worktree shares node_modules)
- Device: C79BF38C-D353-46A2-A1ED-CCA6D68E1B04 (iPhone 17, booted)
- Metro: http://127.0.0.1:8081
- Maestro: `.maestro/gate/step-3-submit.yaml` exit 0
- Oracle: `Assert that id: upload-success is visible... COMPLETED` (real CAS finalize)
- Screenshot: `gate-step-3-submit-success.png`
- RED: prior step 3 `literal_cmd: null` + `wiring_gap_reason` + missing flow path
