---
service: share-lifecycle
feature: UC-SHARE-02
priority: P0
type: happy_path
tier: visible
ac_ref: AC-1
test_tier: e2e
start_state: {"description": "Seeded archive of 200 documents of which exactly 7 are public, each public row's id recorded from Postgres", "seed_method": "cli", "records": ["`holo.ts seed:e2e --reset` writes 200 rows with exactly 7 carrying `is_public = true`", "the 7 public ids are captured for cross-check"]}
action: {"actor": "user", "steps": ["Open the Library and read the share-state indicator on every rendered row without opening any document", "Apply the shared filter and compare the resulting id set against the recorded Postgres set"]}
end_state: {"must_observe": ["a share-state indicator on all `200` rendered rows", "exactly `7` rows marked public, matching the recorded Postgres ids exactly", "the shared filter listing exactly those `7` documents in one view", "a displayed count reading `7`"], "must_not_observe": ["rows with no share-state indicator", "an empty list under the shared filter while 7 documents are public", "a public document missing from the filtered set", "a count that disagrees with the database"]}
negative_control: {"would_fail_if": ["share state is only fetched when a document is opened, so the row indicator is a static default", "the filter runs client-side over a loaded page, so public documents outside that page are omitted", "the indicator is hardcoded to unshared, which answers the security question wrongly and silently"]}
evidence: {"artifact_type": "db_query", "required_capture": true}
---

# Share state is readable by scanning, and the public set is one filter away

With a seeded archive of 200 documents of which seven are public, open the Library. Every row must display its share state without the document being opened, and the seven public documents must be visually distinguishable from the rest at a glance. Apply the shared filter: exactly those seven must be listed, all in one view, and the count must read seven. Cross-check the seven against a direct query of the device Postgres - the sets must be identical.
