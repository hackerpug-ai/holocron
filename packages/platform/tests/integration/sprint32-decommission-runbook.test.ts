/**
 * D08-04 — Decommission runbook ordered-gate contract (read-only).
 *
 * Validates:
 *   AC-1  G0–G6 ordered checklist + exact repository commands
 *   AC-2  D08-03 eligibility is a hard precondition separate from D08-05
 *   AC-3  Human hold / manual / irreversible / redacted receipt language
 *   AC-4  Abort, Postgres/blob recovery, escalation, secret-safe evidence
 *
 * Never executes provider deletion. Never mutates D08-03 evidence.
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run --project integration \
 *     packages/platform/tests/integration/sprint32-decommission-runbook.test.ts
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_IT } from '../../../../tests/integration/service/harness';

const itLive = PLATFORM_IT ? it : it.skip;

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const RUNBOOK = resolve(REPO_ROOT, '.spec/prds/mk6-migration/runbooks/convex-decommission.md');
const DELETION_GATE = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-32-convex-decommission-code-deps-and-cloud-deletion/evidence/D08-03/deletion-gate.json'
);
const ASSERT_SH = resolve(REPO_ROOT, 'scripts/assert-s32-d08-03-deletion-gate.sh');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-S32-D08-04');

const GATES = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'] as const;

/** Exact repository-native command fragments the runbook must document. */
const EXACT_COMMANDS = [
  'bun packages/platform/src/cli/holo.ts verify:no-convex',
  'bun packages/platform/src/cli/holo.ts verify:no-convex-client',
  'bun packages/platform/src/cli/holo.ts verify-no-convex-env',
  'bun packages/platform/src/cli/holo.ts verify:decommission-inventory',
  'scripts/assert-s32-d08-03-deletion-gate.sh',
  'scripts/e2e/run-maestro-reference-flow.sh',
] as const;

function writeEvidence(name: string, body: unknown): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  writeFileSync(path, text.endsWith('\n') ? text : `${text}\n`, 'utf8');
  return path;
}

function firstIndex(haystack: string, needle: string): number {
  return haystack.indexOf(needle);
}

describe('D08-04 decommission runbook (always)', () => {
  it('AC-1: runbook exists, non-empty, ordered G0–G6, exact commands', () => {
    expect(existsSync(RUNBOOK), `missing runbook: ${RUNBOOK}`).toBe(true);
    const st = statSync(RUNBOOK);
    expect(st.size, 'runbook must be non-empty').toBeGreaterThan(1000);

    const text = readFileSync(RUNBOOK, 'utf8');
    expect(text).toMatch(/G0/);
    expect(text).toMatch(/G1/);
    expect(text).toMatch(/G2/);
    expect(text).toMatch(/G3/);
    expect(text).toMatch(/G4/);
    expect(text).toMatch(/G5/);
    expect(text).toMatch(/G6/);
    expect(text).toMatch(/D08-03/);
    expect(text).toMatch(/D08-05/);
    expect(text).toMatch(/ABORT/);
    expect(text).toMatch(/ESCALAT/);
    expect(text).toMatch(/secret/i);

    // Ordered appearance: G0 before G1 … before G6; D08-03 before D08-05.
    const positions = GATES.map((g) => ({ gate: g, idx: firstIndex(text, g) }));
    for (const p of positions) {
      expect(p.idx, `missing ordered gate ${p.gate}`).toBeGreaterThanOrEqual(0);
    }
    for (let i = 1; i < positions.length; i++) {
      expect(
        positions[i]!.idx,
        `${positions[i]!.gate} must appear after ${positions[i - 1]!.gate}`
      ).toBeGreaterThan(positions[i - 1]!.idx);
    }
    const d0803 = firstIndex(text, 'D08-03');
    const d0805 = firstIndex(text, 'D08-05');
    expect(d0803).toBeGreaterThanOrEqual(0);
    expect(d0805).toBeGreaterThan(d0803);

    const missingCmds = EXACT_COMMANDS.filter((c) => !text.includes(c));
    expect(missingCmds, `missing exact commands: ${missingCmds.join(', ')}`).toEqual([]);

    // Must not invent an executable repository deletion verb (negative prose is ok).
    // Reject only command-like lines that invoke deletion, not "do not invent" guidance.
    const commandishDelete = text
      .split('\n')
      .filter((line) => /^\s*(bun |pnpm |npx |holo |\.\/bin\/)/i.test(line))
      .filter((line) => /convex.*delete|delete.*convex/i.test(line));
    expect(commandishDelete, `invented delete commands: ${commandishDelete.join(' | ')}`).toEqual(
      []
    );

    const diff = spawnSync('git', ['diff', '--check', '--', RUNBOOK], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });
    expect(diff.status, diff.stdout + diff.stderr).toBe(0);

    writeEvidence('ac1-runbook-contract.json', {
      bytes: st.size,
      ordered_gate_count: GATES.length,
      D08_03_precedes_D08_05: d0803 < d0805,
      exact_command_count: EXACT_COMMANDS.length - missingCmds.length,
      sha256: createHash('sha256').update(text).digest('hex'),
    });
  });

  it('AC-3: human hold, operator-authorized, production, manual, irreversible, redacted receipt', () => {
    const text = readFileSync(RUNBOOK, 'utf8');
    expect(text).toMatch(/human hold/i);
    expect(text).toMatch(/operator-authorized/);
    expect(text).toMatch(/production/);
    expect(text).toMatch(/manual/);
    expect(text).toMatch(/irreversible/i);
    expect(text).toMatch(/redacted receipt/i);
    expect(text).toMatch(/do not automate/i);
    expect(text).toMatch(/provider/);

    writeEvidence('ac3-human-hold.json', {
      human_hold_required: true,
      operator_authorized_language: /operator-authorized/.test(text),
      production_scope: /production/.test(text),
      manual: /manual/.test(text),
      irreversible: /irreversible/i.test(text),
      redacted_receipt: /redacted receipt/i.test(text),
      do_not_automate: /do not automate/i.test(text),
    });
  });

  it('AC-4: abort exit 2, Postgres/blob recovery, escalation, no Convex rollback, secret-safe', () => {
    const text = readFileSync(RUNBOOK, 'utf8');
    expect(text).toMatch(/abort/i);
    expect(text).toMatch(/Postgres/);
    expect(text).toMatch(/blob/i);
    expect(text).toMatch(/escalat/i);
    expect(text).toMatch(/secret/i);
    expect(text).toMatch(/no rollback/i);
    // Explicit abort exit code contract (must_observe abort_exit_code=2).
    expect(text).toMatch(/exit(?:\s+code)?\s+\*?\*?2\*\*?/i);
    expect(text).toMatch(/exit 2/);
    // Recovery path is Postgres+blob; never promise Convex rollback after deletion.
    expect(text).toMatch(/Postgres \+ blob|Postgres\/blob|Postgres \+ blob \(R2\)/i);
    // Reject affirmative rollback promises; allow "no rollback" / "never rollback" prose.
    expect(text).not.toMatch(
      /(?:can|will|should|may)\s+rollback\s+(?:the\s+)?Convex|rollback\s+Convex\s+(?:after|via)|restore\s+Convex\s+after\s+deletion/i
    );
    expect(text).toMatch(/no rollback/i);

    writeEvidence('ac4-failure-branch.json', {
      abort_exit_code: 2,
      recovery_path: 'postgres+blob',
      escalation_documented: /escalat/i.test(text),
      secret_safe_documented: /secret/i.test(text),
      no_convex_rollback: /no rollback/i.test(text),
    });
  });
});

describe('D08-04 eligibility boundary (PLATFORM_IT)', () => {
  itLive('AC-2: D08-03 pass gate + human hold before D08-05', () => {
    expect(existsSync(DELETION_GATE), `missing D08-03 artifact: ${DELETION_GATE}`).toBe(true);
    expect(statSync(DELETION_GATE).size).toBeGreaterThan(0);

    const raw = readFileSync(DELETION_GATE, 'utf8');
    const data = JSON.parse(raw) as {
      schema?: string;
      status?: string;
      deletion_eligible?: boolean;
      convex_deletion_performed?: boolean;
      checks?: Array<{ status?: string }>;
    };

    expect(data.schema).toBe('holo.decommission.deletion-gate.v1');
    expect(data.status).toBe('pass');
    expect(data.deletion_eligible).toBe(true);
    expect(data.convex_deletion_performed).toBe(false);
    expect(Array.isArray(data.checks) && data.checks!.length > 0).toBe(true);
    expect(data.checks!.every((c) => c.status === 'pass')).toBe(true);

    const jq = spawnSync(
      '/usr/bin/jq',
      [
        '-e',
        '.status == "pass" and .deletion_eligible == true and .convex_deletion_performed == false and ([.checks[]|.status]|all(. == "pass"))',
        DELETION_GATE,
      ],
      { encoding: 'utf8', timeout: 10_000 }
    );
    expect(jq.status, jq.stderr).toBe(0);

    if (existsSync(ASSERT_SH)) {
      const assertRun = spawnSync('bash', [ASSERT_SH, DELETION_GATE], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env },
      });
      expect(assertRun.status, assertRun.stderr + assertRun.stdout).toBe(0);
    }

    const runbook = readFileSync(RUNBOOK, 'utf8');
    expect(runbook).toMatch(/human hold/i);
    expect(runbook).toMatch(/D08-05/);
    expect(runbook).toMatch(/deletion_eligible/);
    expect(runbook).toMatch(/convex_deletion_performed/);
    // Hold must appear as a separate gate after eligibility language, not as auto-delete.
    expect(runbook).toMatch(/G3/);
    expect(runbook.toLowerCase()).toMatch(/human hold/);
    expect(runbook).not.toMatch(/automatically delete convex/i);

    writeEvidence('ac2-eligibility-boundary.json', {
      status: data.status,
      deletion_eligible: data.deletion_eligible,
      convex_deletion_performed: data.convex_deletion_performed,
      checks_pass_count: data.checks!.filter((c) => c.status === 'pass').length,
      human_hold_required: true,
      gate_sha256: createHash('sha256').update(raw).digest('hex'),
    });
  });
});
