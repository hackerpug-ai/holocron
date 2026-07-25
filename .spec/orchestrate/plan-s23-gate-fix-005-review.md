Independent planning validation for Sprint 23 GATE-FIX-005 on current main of /Users/inference1/Projects/holocron. Local-only; no product source, migrations, MCP, or web. Review only `.spec/prds/mk6-migration/tasks/sprint-23-deterministic-human-gate-steering-and-fulcrum-seams/GATE-FIX-005-step3-bounded-probe-ready-poll.md`, the updated `GATE-FIX-PLAN-20260723T061322Z.md`, SPRINT.md, and current gate-plan.json.

Validate against the original GATE-FIX-003 AC-4 contract: step 3b must observe a real committed `research.plan@1` probe before posting advance; a bounded poll/status loop and probe-ready marker must be present; timeout must fail closed with exit 1; no DB inserts; only gate-plan/evidence scope. Ensure the proposed implementation can use the real service and available read-only status/SQL observation without changing product code. Check that it preserves GATE-FIX-004 body-level dual claim and split non-self-matching success token. Correct only task-plan artifacts if needed, commit and land through the normal plan contract, and report SHA plus APPROVE/BLOCK findings. Do not implement gate-plan commands.


LANDING CONTRACT (non-negotiable — a task is DONE only when its reviewed commit is an ancestor of main):
- Committed is NOT done. Reviewed is NOT done. Done = landed on `main`.
- Do ALL branch work in isolated worktrees. The repo's PRIMARY checkout stays on `main` at all
  times — never `git checkout`/`switch` it onto any other branch.
- The moment a task's review is APPROVED, merge it into `main` via kb-orchestrate
  `references/merge-to-main.sh` (flock-serialized; orchestrator-only — subagents never merge).
- Unreviewed work is NEVER merged. Route it through review first; if review cannot happen, list the
  branch explicitly as STRANDED in your final summary — never leave it silently.
- Before declaring your goal complete, run
  `~/Projects/brain/tools/landing/assert-landed.sh <project-dir>` — it must exit 0 (zero stranded
  tasks, zero orphan sprint branches). If it exits 1, landing IS your remaining work.
