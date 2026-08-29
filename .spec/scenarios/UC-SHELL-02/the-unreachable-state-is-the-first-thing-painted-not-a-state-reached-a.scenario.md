---
service: operator-shell
feature: UC-SHELL-02
priority: P1
type: boundary
tier: holdout
---

# The unreachable state is the first thing painted, not a state reached after a false start

With the platform already stopped before the browser opens, sign in and load Library from a cold worker and a cold browser profile. The named unreachable state with its real copy must be what the operator sees, and the interface must never briefly display an empty archive, a zero count, or a populated-then-cleared list on the way there. Record the paint sequence: a flash of empty archive before the failure state is the defect this scenario exists to catch.
