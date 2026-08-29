---
service: public-reader
feature: UC-READ-02
priority: P0
type: edge_case
tier: holdout
---

# Dark never wins over the reader's own operating system preference

Open a shared document three times on a phone-sized viewport: once with prefers-color-scheme light, once with dark, and once with the preference emulated as no-preference. Light and no-preference must both produce a light page whose body background luminance is above 0.85 and whose body text contrast ratio against it is at least 7:1, with all 4,200 words legible. Repeat the light case with a leftover localStorage key of theme=dark planted by a previous visit and with a ?theme=dark query string appended: the operating system preference must still win, because the public reader has no operator theme state to honour.
