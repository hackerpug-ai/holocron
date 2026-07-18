---
status: Completed
sprint: 19
agent: mcp-implementer
---

# mcp-rehost-1 — Registry parity gate

Added `services/platform/src/mcp/verify-rehost.ts` and `holo mcp:verify-rehost`. It cross-checks all manifest IDs against the shared Mastra registry and scans the MCP gateway source for banned Convex imports. Real output: 44/44, zero missing/extra tools, zero Convex refs.
