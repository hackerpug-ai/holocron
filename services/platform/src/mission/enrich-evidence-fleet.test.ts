/**
 * UNIT_TEST_JUSTIFIED: pure enrich seam with zero I/O — asserts quote/sourceText
 * are never laundered with fleet ASSAY/CHALLENGE prose.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EnrichEvidenceFleetError,
  enrichEvidenceWithFleetModelText,
} from './enrich-evidence-fleet.ts';

const FIXTURE_EVIDENCE = {
  claims: [{ id: 'c1', text: 'a', component: 'market' }],
  evidence: [
    {
      id: 'e1',
      claimId: 'c1',
      component: 'market',
      sourceId: 's1',
      independenceGroup: 'g1',
      quote: 'fixture quote',
      sourceText: 'Evidence says fixture quote',
      grade: 2,
      entailment: 0.5,
      disconfirmationResolved: true,
      direction: 'supporting' as const,
    },
  ],
  requiredComponents: ['market'],
};

describe('enrichEvidenceWithFleetModelText', () => {
  it('preserves retrieve/fixture quote+sourceText and never embeds ASSAY laundry', () => {
    const assay = 'Fleet ASSAY prose that would previously overwrite quote';
    const challenge = 'Fleet CHALLENGE prose that would previously append to sourceText';
    const out = enrichEvidenceWithFleetModelText(FIXTURE_EVIDENCE, assay, challenge);

    expect(out.evidence).toHaveLength(1);
    const item = out.evidence![0]!;
    expect(item.quote).toBe('fixture quote');
    expect(item.sourceText).toBe('Evidence says fixture quote');
    expect(item.sourceText.startsWith('ASSAY fleet output:')).toBe(false);
    expect(item.sourceText.includes('ASSAY fleet output:')).toBe(false);
    expect(item.sourceText.includes('CHALLENGE fleet output:')).toBe(false);
    expect(item.quote).not.toContain(assay);
    expect(item.sourceText).not.toContain(assay);
    expect(item.sourceText).not.toContain(challenge);
    // Structural identity: same gate payload (no invented rows / claim text).
    expect(out).toEqual(FIXTURE_EVIDENCE);
  });

  it('fails closed when ASSAY or CHALLENGE text is empty', () => {
    expect(() => enrichEvidenceWithFleetModelText(FIXTURE_EVIDENCE, '  ', 'challenge')).toThrow(
      EnrichEvidenceFleetError
    );
    expect(() => enrichEvidenceWithFleetModelText(FIXTURE_EVIDENCE, 'assay', '')).toThrow(
      EnrichEvidenceFleetError
    );
  });

  it('source audit: runtime + enrich must not assign modelSourceText to quote/sourceText', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const enrichSrc = readFileSync(resolve(here, 'enrich-evidence-fleet.ts'), 'utf8');
    const runtimeSrc = readFileSync(resolve(here, 'runtime.ts'), 'utf8');
    const combined = `${enrichSrc}\n${runtimeSrc}`;

    expect(combined.includes('ASSAY fleet output:')).toBe(false);
    expect(combined.includes('modelSourceText')).toBe(false);
    expect(/quote\s*:\s*quoteFromModel/.test(combined)).toBe(false);
    expect(/sourceText\s*:\s*modelSourceText/.test(combined)).toBe(false);
    expect(/sourceText\s*:\s*`\$\{item\.sourceText\}/.test(combined)).toBe(false);
  });
});
