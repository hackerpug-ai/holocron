Independent review, report-only. Do not call tools, do not edit files. Review SHA f135f2b6 (parent be7d52ac) from this supplied evidence:

Scope: only Sprint 23 gate-plan.json plus GATE-FIX-003/004 task contracts. The implementation changed steps 1/3/4/5 to create fresh runs using `TS=$(date +%s)` and POST `/api/missions`, parse `runId`, fail if empty, and reject `MISSION_NOT_FOUND`. Step 1 POSTs uncited kill and asserts `UNCITED_KILL_REJECTED`. Step 3 creates fresh test.echo and research runs; arm A advances the unprobed echo and checks response body `PROBE_REQUIRED_FOR_VALIDATED` while excluding `MISSION_NOT_FOUND`; arm B advances the research run and checks body `"ok":true` while excluding `MISSION_NOT_FOUND`; success prints split variables `STEP3_PROOF=refused_then_ok` and failure prints `NO_STEP3_DUAL` then `exit 1`. Step 4 creates fresh research then POSTs steer. Step 5 creates fresh research then runs `mission:cycle` with `DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod`, local fleet manifest and `FLEET_URL=http://127.0.0.1:4546/v1`, asserting whitespace-tolerant `"assayChallengeDistinct"\\s*:\\s*true` and excluding `MISSION_NOT_FOUND`. Step 2 already has body-level WIP assertion and failure `exit 1`; step 6 is unchanged.

Fresh implementation evidence `.tmp/GATE-FIX-003-004/verify-summary.json` reports steps 1,3,4,5 all `exit:0, pass:true`. Step 1 response is HTTP 422 with JSON `code:"UNCITED_KILL_REJECTED"`; created run id is `019f8db2-a31b-7c6d-93f9-cf2b572338dc`. Step 3 arm A body is `PROBE_REQUIRED_FOR_VALIDATED`, arm B body is `ok:true`, and log ends `STEP3_PROOF=refused_then_ok`; created IDs are fresh. Step 4 response is HTTP 200 with a steering object and event `eventType:"steer"`; fresh run id. Step 5 response is `ok:true`, cycle index 1, distinct assay/challenge instance IDs, `assayChallengeDistinct:true`; fresh run id. No hard-coded UUID is used in the changed commands.

Return exactly two concise sections:
CODE-REVIEWER: APPROVE or BLOCK, with P0-P3 findings (or “none”) based on shell/JSON correctness, body-level assertions, fail-closed exit codes, and evidence fidelity.
PRODUCT-MANAGER: APPROVE or BLOCK, with P0-P3 findings (or “none”) based on acceptance coverage and false-green risk.
End with `FRESH_QA_ONLY_REMAINING: YES` or `NO`. Do not claim sprint completion.


LANDING NOTE (review/qa stage): you never merge, push, or move any checkout to another branch, and
you do not modify product code. Your verdict does not land work — the run stage merges the reviewed
commit to `main` after you approve. Cite the exact SHA you reviewed so the land is auditable.
