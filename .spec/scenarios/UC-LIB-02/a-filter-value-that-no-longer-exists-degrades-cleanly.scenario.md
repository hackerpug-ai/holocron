---
service: archive-library
feature: UC-LIB-02
priority: P1
type: edge_case
tier: holdout
---

# A filter value that no longer exists degrades cleanly

Open the Library with a URL carrying an unknown filter parameter and a category value that has been removed from the archive. The page must render the archive with real rows, the unrecognised filters either ignored or visibly reported, never a crash, never an infinite spinner, and never a silently empty list that looks like an empty archive. Then delete the last document in a currently applied category while the filter is on and confirm the surface moves to the explained zero state rather than erroring.
