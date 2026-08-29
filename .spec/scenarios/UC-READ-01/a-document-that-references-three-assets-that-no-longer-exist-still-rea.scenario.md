---
service: public-reader
feature: UC-READ-01
priority: P0
type: error_handling
tier: holdout
---

# A document that references three assets that no longer exist still reads as a finished document

Take a published document whose markdown references assets/gone-1, assets/gone-2 and an absolute remote URL on a host that returns 404. Delete those asset rows from the device Postgres before requesting the page. All 3,900 words of prose must render in full, and each unresolvable image must degrade to its alt text or an explicitly designed missing-figure treatment. What must never appear anywhere in the body: a bare exclamation mark followed by bracketed alt text, an anchor whose href is '#', a browser broken-image icon, or an inline stack trace. Also request assets/../../etc/passwd and assets/%2e%2e%2fsecret under the same token and expect neither to escape the document's asset scope.
