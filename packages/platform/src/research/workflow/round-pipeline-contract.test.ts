/**
 * UNIT_TEST_JUSTIFIED: source audit that rounds/commits cannot fake gate fields.
 * Zero I/O — reads shipped workflow files.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DIR = dirname(fileURLToPath(import.meta.url));

describe('research round/commit pipeline contract', () => {
  it('executeResearchRound drives acquireAdmissibleEvidence (not fake grade/entailment)', () => {
    const round = readFileSync(join(DIR, 'round.ts'), 'utf8');
    expect(round).toMatch(/acquireAdmissibleEvidence/);
    expect(round).not.toMatch(/independentSourceFloor:\s*1/);
    expect(round).not.toMatch(/disconfirmationResolved:\s*true/);
    expect(round).not.toMatch(/entailment:\s*0\.85/);
    expect(round).not.toMatch(/sourceTier\(/);
  });

  it('commit never sets sourceText to the quote', () => {
    const depth = readFileSync(join(DIR, 'research-depth.ts'), 'utf8');
    const breadth = readFileSync(join(DIR, 'research-breadth.ts'), 'utf8');
    const commit = readFileSync(join(DIR, 'commit.ts'), 'utf8');
    expect(depth).not.toMatch(/sourceText:\s*f\.quote/);
    expect(breadth).not.toMatch(/sourceText:\s*f\.quote/);
    expect(commit).toMatch(/independentSourceFloor:\s*2/);
    expect(commit).toMatch(/publishResearchReport/);
    expect(commit).toMatch(/f\.sourceText/);
    expect(commit).toMatch(/f\.disconfirmationResolved/);
  });
});
