---
service: share-lifecycle
feature: UC-SHARE-03
priority: P0
type: happy_path
tier: visible
ac_ref: AC-3
test_tier: e2e
start_state: {"description": "`Edge Inference Cost Curves` public at a known token and confirmed returning HTTP `200` with its body from 3 edge locations before the revocation", "seed_method": "public_api", "records": ["the pre-revocation GET returned HTTP `200` containing `Edge Inference Cost Curves` at all 3 locations", "the document row reads `is_public = true`"]}
action: {"actor": "user", "steps": ["Press unshare once on the Library row and capture the interface copy at that instant", "Poll the public URL once per second from an external client at 3 edge locations for 120 seconds"]}
end_state: {"must_observe": ["copy stating a bound of `60` seconds rendered at the moment of the unshare", "the stated `60` matching the `max-age` on the deployed withdrawn response", "the withdrawn page returned at all `3` locations no later than `60` seconds after the unshare", "`0` document responses at any location after that bound across the remaining polls"], "must_not_observe": ["no bound stated at all at the moment of unsharing", "the document body served after the 60-second bound", "an empty or blank response in place of the withdrawn page", "a stated bound that disagrees with the deployed cache headers"]}
negative_control: {"would_fail_if": ["only the standard cache header is set, so the zone default TTL applies and the link stays readable long past the stated bound", "the bound is a static string in the UI unrelated to the deployed configuration", "the unshare write is a no-op and the token keeps resolving"]}
evidence: {"artifact_type": "api_response", "required_capture": true}
---

# One action revokes, the bound is stated, and the link is dead inside it

With 'Edge Inference Cost Curves' public and its URL confirmed resolving, press unshare once on its Library row. At that moment the interface must state the propagation bound in words the operator can read, naming sixty seconds. Immediately begin polling the public URL from an external client once per second: it must return the withdrawn page no later than sixty seconds after the unshare, and it must never return the document after that point. Record the first timestamp at which the withdrawn page appeared.
