#!/usr/bin/env bun
/**
 * REDHAT-FIX-H1 — CLI one-shot Zero read consumed by capstone-verdict.sh.
 *
 * Usage:
 *   bun scripts/e2e/zero-reference-read.ts
 *
 * Env:
 *   ZERO_CACHE_URL            zero-cache base URL (default http://127.0.0.1:4848)
 *   REFERENCE_CONVERSATION_ID conversation id (default 00000000-...-020)
 *
 * Prints a single JSON line on stdout with the canonical ZeroReadResult shape
 * (see services/platform/tests/integration/helpers/zero-oneshot.ts). Exit 0 iff
 * a 'complete' resultType was observed — callers (the verifier) interpret the
 * JSON fields; this script itself never fabricates an agent row.
 */
import { readConversationViaZero } from '../../services/platform/tests/integration/helpers/zero-oneshot.ts';

const server = process.env.ZERO_CACHE_URL || 'http://127.0.0.1:4848';
const conversationId =
  process.env.REFERENCE_CONVERSATION_ID || '00000000-0000-0000-0000-000000000020';

const result = await readConversationViaZero({ server, conversationId });
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
