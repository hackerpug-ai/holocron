---
stability: PRODUCT_CONTEXT
last_validated: 2026-07-13
prd_version: 1.0.0
---

# Roles

This is a single-operator personal system. "Roles" here are the distinct *modes* the one human occupies plus the non-human actors, since acceptance criteria are phrased per actor.

| Role | Description |
|------|-------------|
| **Operator** | The system owner acting as platform administrator: stands up Postgres + Mastra on the mini, runs the ETL, approves the cutover, sets inference budgets, and triages the mission queue. Owns the irreversible steps (Convex deployment deletion). |
| **User** | The same human as consumer of holocron on the **RN app**: reads documents/feeds, chats, listens to narration, submits improvements, starts research — expecting live, reactive data. |
| **Agent Client** | External harnesses (Claude Code, Cursor, other MCP consumers) that call holocron through the **MCP gateway** — the primary programmatic surface. Expects the 44 tools to keep working, backed by Postgres instead of Convex. |
| **System** | The Mastra platform itself: the Mission Engine, scheduler/queue, model role router, evidence gate, and reactive bridge. Many criteria are phrased "System can …" because they must *always* happen deterministically (scheduling, gate enforcement, budget ceilings, degraded-mode fallback) rather than depend on a model's choice. |
| **Public Reader** | An unauthenticated visitor who opens a shared `/article/{shareToken}` link. The only externally-reachable, non-tailnet surface. |

**Note on fulcrum:** fulcrum is not a role — it is a *standing mission template* that the **System** runs. Its human-triage interactions are performed by the **Operator**.
