/**
 * S31-MCP-03 AC-5 — widened Convex residue scan negative control.
 * Seeds a convex/browser import outside src/mcp on a temp copy of the served
 * source root and asserts verifyMcpRehost flags it while allowlisted cutover
 * modules stay clean. Never mutates the committed tree.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONVEX_RESIDUE_ALLOWLIST,
  verifyMcpRehost,
} from '../../services/platform/src/mcp/verify-rehost.ts';

const ROOT = resolve(import.meta.dirname, '../..');
const SERVED_SRC = resolve(ROOT, 'services/platform/src');

describe('MCP verify-rehost residue scan (S31-MCP-03)', () => {
  it('AC-5 widened Convex scan catches residue outside src/mcp', () => {
    // would fail if static | stub | empty | mock — scan must reach beyond src/mcp
    const tmpSrc = mkdtempSync(resolve(tmpdir(), 'holocron-residue-src-'));
    try {
      cpSync(SERVED_SRC, tmpSrc, { recursive: true });
      const probeRel = 'tools/s31-residue-probe.ts';
      const probePath = resolve(tmpSrc, probeRel);
      mkdirSync(resolve(tmpSrc, 'tools'), { recursive: true });
      writeFileSync(probePath, "import { ConvexClient } from 'convex/browser';\n", 'utf8');

      const seeded = verifyMcpRehost({ cwd: ROOT, sourceRoot: tmpSrc });
      expect(seeded.ok).toBe(false);
      expect(seeded.convexRefs).toHaveLength(1);
      expect(
        seeded.convexRefs.some((p) => p.replace(/\\/g, '/').endsWith('tools/s31-residue-probe.ts'))
      ).toBe(true);

      // Allowlisted cutover modules must not appear even though they import Convex.
      for (const allowed of CONVEX_RESIDUE_ALLOWLIST) {
        expect(
          seeded.convexRefs.some((p) => p.replace(/\\/g, '/').endsWith(allowed)),
          `allowlisted module must not appear in convexRefs: ${allowed}`
        ).toBe(false);
      }

      // Allowlist asserted by value — never swallow the whole served root.
      const declared = [
        'cutover/convex-fence-client.ts',
        'cutover/convex-live-attestation.ts',
        'cutover/data-plane-content.ts',
        'cutover/ponr.ts',
      ] as const;
      expect([...CONVEX_RESIDUE_ALLOWLIST].sort()).toEqual([...declared].sort());
      expect(CONVEX_RESIDUE_ALLOWLIST.length).toBeGreaterThanOrEqual(1);
      expect(CONVEX_RESIDUE_ALLOWLIST).not.toContain('services/platform/src');

      const real = verifyMcpRehost({ cwd: ROOT });
      expect(real.ok).toBe(true);
      expect(real.convexRefs).toHaveLength(0);
    } finally {
      rmSync(tmpSrc, { recursive: true, force: true });
    }
  });
});
