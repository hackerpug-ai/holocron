---
service: operator-shell
feature: UC-SHELL-01
priority: P0
type: security
tier: holdout
---

# A tampered session cookie produces a clean sign-in, not a loop or a leak

Take a valid session cookie and mutate it three ways: flip one character of the signature, replace the payload with another account id, and set it to an expired timestamp. For each, request /library. Each must land on the sign-in page with its real form rendered exactly once, with the bad cookie cleared, and none may produce a redirect loop, a 500, a partially rendered Library shell, or any document row. Confirm no request reached the device platform carrying the forged identity.
