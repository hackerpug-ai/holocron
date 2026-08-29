---
service: archive-library
feature: UC-LIB-01
priority: P0
type: error_handling
tier: holdout
---

# A sleeping device never masquerades as an empty archive

Stop the device platform, then run a search that would normally return twelve results. The surface must name the archive host as unreachable in its own copy and offer retry. It must not say no documents matched, must not show a zero count, and must not present the empty-archive state. Restart the platform and press retry: the twelve results must arrive without navigating away. This is the single most consequential confusion in the whole Library, because the operator's response to 'nothing found' is to spend twenty minutes re-researching something he already owns.
