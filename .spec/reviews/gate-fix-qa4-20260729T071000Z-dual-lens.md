# GATE-FIX-QA4 dual-lens closeout

- **QA fail:** `20260729T064907Z` on main `407fadb2` (verified fail 4/6; all raw exits 0)
- **Branch tip:** `c8568b06d232ada643f4a595e3af863d0a058d96`
- **Change class:** gate-plan assertion alignment only (not product code)

## Lenses

| Lens | Verdict |
|------|---------|
| Product | APPROVED (anti-weakening) |
| Technical | APPROVED (anti-weakening) |

## Fix

Steps 4–5 `require_all_regex` now match jq -e success output `^true$` + `expected_exit: 0`.
All six `literal_cmd` byte-identical; domain predicates remain inside frozen jq expressions + cmd_sha fidelity.
Regression: `scripts/gate/s28-qa4-step4-5-jq-true-assertion.sh` — historical evidence passes under new plan; OLD plan RED; false still fails.
Authoritative gate-results/evidence not overwritten; human gate not re-run.
