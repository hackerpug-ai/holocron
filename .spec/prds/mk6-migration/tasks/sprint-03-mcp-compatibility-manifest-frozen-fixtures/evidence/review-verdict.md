# Review Verdict — mcp-manifest-05

**Task:** Review manifest protocol compliance; prove the completeness gate is un-fakeable  
**Reviewer:** mcp-reviewer  
**Date:** 2026-07-14  
**Verdict: APPROVED**

---

## AC-1: Fixture-missing negative control (PRIMARY)

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:verify-manifest --manifest services/platform/tests/fixtures/mcp-manifest/manifest-missing-store_document.yaml
```

**Output:**
```
43/44 tools covered, both transports covered

Issues:
  - store_document not covered by manifest
store_document not covered by manifest
```

**Exit code:** 1 (non-zero)  
**Stderr contains "store_document":** YES  
**Result:** PASS — the gate correctly exits non-zero and names the missing tool.

---

## AC-2: Orphan-entry negative control

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:verify-manifest --manifest services/platform/tests/fixtures/mcp-manifest/manifest-orphan-fake_tool.yaml
```

**Output:**
```
44/44 tools covered, both transports covered

Issues:
  - fake_tool not registered in holocron-mcp
fake_tool not registered in holocron-mcp
```

**Exit code:** 1 (non-zero)  
**Stderr contains "fake_tool":** YES  
**Result:** PASS — the gate correctly exits non-zero and names the orphan entry.

---

## AC-3: Protocol 2025-11-25 + both transports + stateless/no-server-sampling + auth posture

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:verify-manifest --protocol
```

**Output:**
```
Protocol: 2025-11-25
Transports: stdio, streamable-http
Stateless: true
No server sampling: true
Auth policy: stdio, streamable_http configured
Cancellation policy: posture=cooperative, supported=true
```

**Exit code:** 0  
**Result:** PASS

**Manifest header confirmation** (`.spec/prds/mk6-migration/10-technical-requirements/14-mcp-compatibility-manifest.yaml`, lines 7-30):

| Field | Declared Value | Verified |
|-------|---------------|----------|
| `protocol` | `"2025-11-25"` | YES |
| `transports` | `[stdio, streamable-http]` | YES |
| `stateless` | `true` | YES |
| `no_server_sampling` | `true` | YES |
| `auth_policy` | stdio + streamable_http (api-key, bearer) | YES |
| `cancellation_policy` | `posture: cooperative` | YES |

---

## AC-4: All 44 tools covered + frozen fixtures + replay contracts

### 4a. Full verify-manifest (positive control)

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:verify-manifest
```

**Output:**
```
44/44 tools covered, both transports covered
```

**Exit code:** 0  
**Result:** PASS

### 4b. List mutations with replay contracts

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:list-mutations
```

**Output:** 21 mutation tools listed, each with `idempotency_key` and `stored_result` fields. Full list:

1. store_document — idempotency_key: `[title, content]`, stored_result: `documentId`
2. update_document — idempotency_key: `[documentId]`, stored_result: `documentId`
3. share_document — idempotency_key: `[documentId, isPublic]`, stored_result: `shareToken`
4. add_subscription — idempotency_key: `[sourceType, identifier]`, stored_result: `subscriptionId`
5. remove_subscription — idempotency_key: `[subscriptionId]`, stored_result: `deleted`
6. check_subscriptions — idempotency_key: `[sourceType]`, stored_result: `totalQueued`
7. set_subscription_filter — idempotency_key: `[sourceId, ruleName]`, stored_result: `filterId`
8. store_tool — idempotency_key: `[title, sourceType, category]`, stored_result: `toolId`
9. update_tool — idempotency_key: `[toolId]`, stored_result: `toolId`
10. remove_tool — idempotency_key: `[toolId]`, stored_result: `deleted`
11. shop_products — idempotency_key: `[query, condition, priceMin, priceMax]`, stored_result: `sessionId`
12. start_assimilation — idempotency_key: `[repositoryUrl]`, stored_result: `sessionId`
13. approve_assimilation_plan — idempotency_key: `[sessionId]`, stored_result: `approved`
14. reject_assimilation_plan — idempotency_key: `[sessionId, feedback]`, stored_result: `rejected`
15. cancel_assimilation — idempotency_key: `[sessionId]`, stored_result: `cancelled`
16. steer_assimilation — idempotency_key: `[sessionId, note]`, stored_result: `steered`
17. assimilate_creator — idempotency_key: `[profileId, forceRegenerate]`, stored_result: `transcriptsCreated`
18. regenerate_transcript — idempotency_key: `[contentId]`, stored_result: `jobId`
19. add_improvement — idempotency_key: `[items]`, stored_result: `ids`
20. close_improvement — idempotency_key: `[id]`, stored_result: `status`
21. set_improvement_status — idempotency_key: `[id, status]`, stored_result: `status`

**Exit code:** 0  
**Result:** PASS — 21 mutations, each with a replay contract.

### 4c. Frozen success fixture count

**Command:**
```
ls services/platform/tests/fixtures/mcp-manifest/*_success.json | wc -l
```

**Output:** `44`  
**Result:** PASS — 44 frozen success fixtures (one per tool).

### 4d. Registry cross-check (non-self-referential)

`services/platform/src/mcp/registry-reader.ts` reads tool IDs from `holocron-mcp/src/mastra/stdio.ts` by parsing `createTool({ id: "..." })` calls. It does NOT read from the manifest itself — the completeness gate is cross-referential against the real Mastra registration surface.

**Result:** PASS — the gate cannot be satisfied by merely adding manifest entries without corresponding real tool registrations.

---

## Additional Checks

### manifest-schema store_document

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:manifest-schema store_document
```

**Output:** Printed full input JSON Schema (title, content required; metadata optional), output schema (documentId, title, embeddingStatus enum, embeddingDimensions), and defaults (metadata={}, category=general, date=auto).  
**Exit code:** 0  
**Result:** PASS

### manifest-replay add_subscription

**Command:**
```
bun services/platform/src/cli/holo.ts mcp:manifest-replay add_subscription
```

**Output:** Printed idempotency key `[sourceType, identifier]`, stored result `subscriptionId`, and replay fixture showing first_call_result and second_call_result returning identical data.  
**Exit code:** 0  
**Result:** PASS

### Integration test suite: mcp-verify-manifest

**Command:**
```
MCP_IT=1 bunx vitest run tests/integration/mcp-verify-manifest.test.ts
```

**Output:** 1 test file passed, 10 tests passed  
**Exit code:** 0  
**Result:** PASS

### Integration test suite: mcp-manifest-negative-controls

**Command:**
```
MCP_IT=1 bunx vitest run tests/integration/mcp-manifest-negative-controls.test.ts
```

**Output:** 1 test file passed, 8 tests passed  
**Exit code:** 0  
**Result:** PASS

### Integration test suite: mcp-replay-contract

**Command:**
```
MCP_IT=1 bunx vitest run tests/integration/mcp-replay-contract.test.ts
```

**Output:** 1 test file passed, 9 tests passed  
**Exit code:** 0  
**Result:** PASS

---

## Gaps Found

None. All acceptance criteria pass. The completeness gate is provably un-fakeable:

1. **Missing-tool control (AC-1):** A manifest omitting a real tool exits non-zero naming the tool.
2. **Orphan-entry control (AC-2):** A manifest declaring a non-existent tool exits non-zero naming the orphan.
3. **Bidirectional cross-check (AC-4d):** The registry reader parses real `createTool` calls from `holocron-mcp/src/mastra/stdio.ts`, not the manifest itself — satisfying the gate requires both sides to agree.

---

## Integrity Confirmation

No source files, test files, committed YAML, fixtures, or `holocron-mcp/src/**` were modified during this review. Only this evidence artifact was created.
