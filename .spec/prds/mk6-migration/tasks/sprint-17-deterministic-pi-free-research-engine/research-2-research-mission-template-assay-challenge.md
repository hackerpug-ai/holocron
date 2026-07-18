---
status: In Progress
sprint: 17
agent: mastra-implementer
---

# research-2 — Durable research mission

Register the closed `research` mission template on Sprint 15. The current seam executes fleet probe→ASSAY→CHALLENGE→pure gate→commit, suspends on thin evidence, and resumes after new evidence; `research:inspect` and `research:trace --processes` expose persisted phases. Remaining work is to replace the fixture seam with durable retrieved evidence and complete PLAN→RETRIEVE→EXTRACT persistence without pi/external-harness dependency.
