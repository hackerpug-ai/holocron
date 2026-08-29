---
service: archive-library
feature: UC-LIB-02
priority: P2
type: boundary
tier: holdout
---

# A deep link into a filtered view works on a first-ever load

From a cold profile and a cold worker, open the Library directly at a URL carrying the shared chip and a query. The first paint must show the filtered, queried result set with the chips visibly active and the correct count. The interface must not render the unfiltered 200-row archive first and then narrow it, because that flash is what makes a screenshot of 'what is public' untrustworthy.
