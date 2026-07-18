# REDHAT-FIX-H1-R RED evidence

Proves the prior post-judge score floor rewrote raw judge scores:

1. `floor-code-excerpt.ts` — floor branch from impl commit `aabe904` (return 0.8 when score in [0.4,0.8) for structured citation-free briefs).
2. `unit-floor-red.json` — pure simulation: raw 0.6 → emitted 0.8 (assertion `emitted == raw` fails).
3. `prior-green-combined-contradiction.txt` — prior GREEN package where judge prose justified a score below 0.8 while machine score was forced to 0.8.

This package is historical RED retained before the H-1-R fix removed the floor.
