---
service: share-lifecycle
feature: UC-SHARE-02
priority: P0
type: error_handling
tier: holdout
---

# A sleeping device does not let a row claim a document is private

Load the Library with its seven public rows visible, then stop the device platform and force a refetch of share state. No row may render as unshared on the strength of a failed request. Either the previously known state must persist with a visible staleness signal, or the surface must name the archive host as unreachable. A row that quietly reads 'not shared' because the platform did not answer is how a public document stops being audited.
