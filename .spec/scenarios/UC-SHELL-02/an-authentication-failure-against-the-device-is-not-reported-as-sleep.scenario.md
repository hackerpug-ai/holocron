---
service: operator-shell
feature: UC-SHELL-02
priority: P1
type: security
tier: holdout
---

# An authentication failure against the device is not reported as sleep

Keep the platform running but reject the application's credential at the platform boundary. The Library must not tell the operator that the machine is asleep, because it is not - it must name a distinct condition that points at credentials, in its own copy. Retrying that state must not succeed by luck, and no document data may render from a stale client cache while the connection is unauthorised.
