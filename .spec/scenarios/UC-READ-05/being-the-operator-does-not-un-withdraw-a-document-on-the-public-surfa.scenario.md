---
service: public-reader
feature: UC-READ-05
priority: P1
type: security
tier: holdout
---

# Being the operator does not un-withdraw a document on the public surface

Sign in as the operator in the same browser, then open the revoked public URL on the docs host. The operator must see the same withdrawn page a stranger sees, with the same copy, no privileged reveal, no edit affordance, and no 'you own this, view anyway' path. The public surface has exactly one behaviour per token state, and an operator-specific branch there is precisely how the recipient's real view stops being observable.
