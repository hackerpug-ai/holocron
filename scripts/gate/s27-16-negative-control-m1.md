# REDHAT-FIX-S27-16 negative control M1

Mutation M1: stub `postBackupAlert` to return `{ok:true}` without calling `fetch`.

**Must fail** gate step 8 because:
- independent CAP file is missing or lacks envelopes → `test -f "$CAP"` / jq envelope fails (fail-closed; no SOFT_OK)
- job-bound rawBody cannot bind without real HTTP receiver captures

Hard tokens: `ALERT_HTTP_CAPTURES_OK`, `ALERT_HTTP_JOB_BIND_OK` in require_all_regex.
