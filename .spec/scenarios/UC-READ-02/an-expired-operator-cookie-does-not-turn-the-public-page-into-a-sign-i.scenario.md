---
service: public-reader
feature: UC-READ-02
priority: P0
type: security
tier: holdout
---

# An expired operator cookie does not turn the public page into a sign-in funnel

Plant a stale, expired session cookie for the operator on the docs host, then request a shared document. The response must be the full document with its 4,200 words. It must not redirect, must not return a 401 or 302 toward any sign-in route, must not render an account affordance, and must not issue a fresh Set-Cookie. Repeat with a deliberately corrupted cookie value containing a script tag: the page must still serve the document and must not echo the cookie value anywhere into the HTML.
