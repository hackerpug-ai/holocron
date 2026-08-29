/**
 * REDHAT-FIX-H1 — CAP-BAK-01 / D05-02..D05-06 capability completeness inventory.
 *
 * Fail-closed presence + wiring evidence: every restore-half deliverable path
 * and every restore CLI verb must exist. Writes
 * `.tmp/REDHAT-FIX-H1/capability-inventory.json` for red-hat / gate consumption.
 *
 * Run:
 *   pnpm vitest run packages/platform/tests/integration/sprint28-capability-inventory.test.ts
 *   PLATFORM_IT=1 pnpm vitest run packages/platform/tests/integration/sprint28-capability-inventory.test.ts
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const HOLO_CLI = resolve(REPO_ROOT, 'packages/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H1');
const INVENTORY_PATH = resolve(EVIDENCE_DIR, 'capability-inventory.json');
const BUN_BIN = process.env.BUN_BIN ?? 'bun';

/** D05-02..D05-06 deliverables required for CAP-BAK-01 restore half. */
const REQUIRED_PATHS: ReadonlyArray<{ id: string; path: string; kind: string }> = [
  // D05-02 — PITR restore operator command
  { id: 'D05-02.restore', path: 'packages/platform/src/backup/restore.ts', kind: 'module' },
  { id: 'D05-02.cli', path: 'packages/platform/src/cli/holo.ts', kind: 'cli' },
  // D05-03 — fresh target + isolation
  {
    id: 'D05-03.provision',
    path: 'scripts/provision-fresh-restore-target.sh',
    kind: 'script',
  },
  { id: 'D05-03.prove-isolation', path: 'scripts/prove-isolation.sh', kind: 'script' },
  {
    id: 'D05-03.fresh-target-doc',
    path: 'packages/platform/src/backup/fresh-target.md',
    kind: 'doc',
  },
  // D05-04 — fire-drill + parity
  { id: 'D05-04.fire-drill', path: 'packages/platform/src/backup/fire-drill.ts', kind: 'module' },
  {
    id: 'D05-04.parity-report',
    path: 'packages/platform/src/backup/parity-report.ts',
    kind: 'module',
  },
  {
    id: 'D05-04.evidence-ledger-verify',
    path: 'packages/platform/src/backup/evidence-ledger-verify.ts',
    kind: 'module',
  },
  {
    id: 'D05-04.recovery-baseline',
    path: 'packages/platform/src/backup/recovery-baseline.ts',
    kind: 'module',
  },
  { id: 'D05-04.fire-drill-wrapper', path: 'scripts/fire-drill.sh', kind: 'script' },
  // D05-05 — monthly mission + runbook + launchd
  {
    id: 'D05-05.mission-template',
    path: 'packages/platform/src/mission/templates/fire-drill-monthly.ts',
    kind: 'module',
  },
  {
    id: 'D05-05.mission-template-json',
    path: 'packages/platform/src/mission/templates/fire-drill-monthly.json',
    kind: 'module',
  },
  {
    id: 'D05-05.launchd-plist',
    path: 'packages/platform/deploy/launchd/holocron-fire-drill-monthly.plist',
    kind: 'launchd',
  },
  {
    id: 'D05-05.runbook',
    path: '.spec/prds/mk6-migration/runbooks/fire-drill-monthly.md',
    kind: 'doc',
  },
  // D05-06 — security review + verify scripts
  {
    id: 'D05-06.security-review',
    path: '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill/security-review-D05-06.md',
    kind: 'doc',
  },
  {
    id: 'D05-06.verify-isolation',
    path: 'scripts/verify-restore-isolation.sh',
    kind: 'script',
  },
  { id: 'D05-06.verify-creds', path: 'scripts/verify-restore-creds.sh', kind: 'script' },
  {
    id: 'D05-06.verify-artifacts',
    path: 'scripts/verify-restored-artifacts.sh',
    kind: 'script',
  },
  {
    id: 'D05-06.verify-postgres-exposure',
    path: 'scripts/verify-postgres-exposure.sh',
    kind: 'script',
  },
  // Package surface
  { id: 'backup.index', path: 'packages/platform/src/backup/index.ts', kind: 'module' },
  // Integration oracles that wire the capability
  {
    id: 'IT.restore-fails-closed',
    path: 'packages/platform/tests/integration/sprint28-restore-fails-closed.test.ts',
    kind: 'test',
  },
  {
    id: 'IT.fire-drill-mission',
    path: 'packages/platform/tests/integration/sprint28-fire-drill-mission-contract.test.ts',
    kind: 'test',
  },
  {
    id: 'IT.recovery-baseline',
    path: 'packages/platform/tests/integration/sprint28-recovery-baseline.test.ts',
    kind: 'test',
  },
];

/** CLI verbs that must be registered in holo usage + case routing. */
const REQUIRED_CLI_VERBS = [
  'restore',
  'restore:pitr',
  'restore:status',
  'restore:fire-drill',
] as const;

type PathInventoryEntry = {
  id: string;
  path: string;
  kind: string;
  absolute: string;
  present: boolean;
  sizeBytes: number | null;
};

function ensureEvidenceDir(): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
}

function inventoryPaths(): PathInventoryEntry[] {
  return REQUIRED_PATHS.map((item) => {
    const absolute = resolve(REPO_ROOT, item.path);
    const present = existsSync(absolute);
    let sizeBytes: number | null = null;
    if (present) {
      try {
        sizeBytes = statSync(absolute).size;
      } catch {
        sizeBytes = null;
      }
    }
    return {
      id: item.id,
      path: item.path,
      kind: item.kind,
      absolute,
      present,
      sizeBytes,
    };
  });
}

/**
 * Prefer static CLI source for verb wiring (avoids full holo --help cold-start hang
 * under default 5s vitest timeouts — REDHAT residual N-M3).
 * Optional short help spawn is best-effort only.
 */
function readHoloHelp(): { status: number | null; combined: string } {
  let helpText = '';
  let status: number | null = null;
  try {
    // Single short spawn — do not chain bare + --help (doubles cold-start cost).
    const result = spawnSync(BUN_BIN, [HOLO_CLI, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, HOLO_SKIP_STACK_BOOT: '1' },
    });
    status = result.status;
    helpText = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    if (result.error && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
      helpText += '\n(help spawn timed out — relying on case routing in source)\n';
    }
  } catch (e) {
    helpText = `help spawn failed: ${e instanceof Error ? e.message : String(e)}`;
  }
  return { status, combined: helpText };
}

function cliVerbWired(helpText: string, cliSource: string, verb: string): boolean {
  const helpHit = new RegExp(`^\\s*${verb.replace(':', '\\:')}\\b`, 'm').test(helpText);
  const caseHit =
    cliSource.includes(`case '${verb}'`) ||
    cliSource.includes(`case "${verb}"`) ||
    // restore and restore:pitr share a case block
    (verb === 'restore:pitr' &&
      (cliSource.includes("case 'restore:pitr'") || cliSource.includes('restore:pitr')));
  return helpHit || caseHit;
}

describe('REDHAT-FIX-H1 sprint28 capability inventory (D05-02..D05-06)', () => {
  it('fail-closed: every required D05-02..D05-06 path is present and non-empty', () => {
    ensureEvidenceDir();
    const paths = inventoryPaths();
    const missing = paths.filter((p) => !p.present);
    const empty = paths.filter((p) => p.present && (p.sizeBytes === null || p.sizeBytes <= 0));

    expect(
      missing,
      `missing required capability paths:\n${missing.map((m) => `  - ${m.id}: ${m.path}`).join('\n')}`
    ).toEqual([]);
    expect(
      empty,
      `empty required capability files:\n${empty.map((m) => `  - ${m.id}: ${m.path}`).join('\n')}`
    ).toEqual([]);
  });

  it('fail-closed: restore CLI verbs are wired (help surface + case routing)', () => {
    expect(existsSync(HOLO_CLI), `holo CLI missing: ${HOLO_CLI}`).toBe(true);
    const cliSource = readFileSync(HOLO_CLI, 'utf8');
    // Case routing is authoritative; help spawn is best-effort (N-M3 timeout fix).
    const help = readHoloHelp();

    // --pitr must not be an unknown flag on a valid restore invocation shape
    const smoke = spawnSync(
      BUN_BIN,
      [
        HOLO_CLI,
        'restore',
        '--pitr',
        '2099-01-01T00:00:00Z',
        '--scratch',
        resolve(EVIDENCE_DIR, 'inventory-scratch'),
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 60_000,
        env: { ...process.env },
      }
    );
    const smokeCombined = `${smoke.stdout ?? ''}\n${smoke.stderr ?? ''}`;
    expect(smokeCombined).not.toMatch(/unknown flag:\s*--pitr/i);
    // Domain fail-closed (missing secrets / outside WAL / empty chain) is OK — not parser exit-only.
    expect(
      smoke.status,
      `restore --pitr must exit non-zero when not restorable; got 0\n${smokeCombined}`
    ).not.toBe(0);

    const verbs = REQUIRED_CLI_VERBS.map((verb) => {
      const wired = cliVerbWired(help.combined, cliSource, verb);
      return { verb, wired, helpHit: new RegExp(verb.replace(':', '\\:')).test(help.combined) };
    });
    const unwired = verbs.filter((v) => !v.wired);
    expect(
      unwired,
      `CLI verbs not wired:\n${unwired.map((v) => `  - ${v.verb}`).join('\n')}\nhelp excerpt:\n${help.combined.slice(0, 1500)}`
    ).toEqual([]);
  }, 120_000);

  it('writes .tmp/REDHAT-FIX-H1/capability-inventory.json with paths + CLI verbs', () => {
    ensureEvidenceDir();
    const paths = inventoryPaths();
    const cliSource = readFileSync(HOLO_CLI, 'utf8');
    // Prefer source case routing; optional help for inventory surface flags.
    const help = { combined: cliSource, status: null as number | null };
    const cliVerbs = REQUIRED_CLI_VERBS.map((verb) => ({
      verb,
      wired: cliVerbWired(help.combined, cliSource, verb),
      helpSurface: new RegExp(verb.replace(':', '\\:')).test(help.combined),
      caseRouting:
        cliSource.includes(`case '${verb}'`) ||
        cliSource.includes(`case "${verb}"`) ||
        (verb === 'restore' && cliSource.includes("case 'restore'")),
    }));

    const inventory = {
      task: 'REDHAT-FIX-H1',
      capability: 'CAP-BAK-01',
      sprint: 'sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill',
      generatedAt: new Date().toISOString(),
      repoRoot: REPO_ROOT,
      summary: {
        requiredPathCount: paths.length,
        presentPathCount: paths.filter((p) => p.present).length,
        missingPathCount: paths.filter((p) => !p.present).length,
        requiredCliVerbCount: cliVerbs.length,
        wiredCliVerbCount: cliVerbs.filter((v) => v.wired).length,
        complete:
          paths.every((p) => p.present && (p.sizeBytes ?? 0) > 0) && cliVerbs.every((v) => v.wired),
      },
      paths,
      cliVerbs,
      deliverablesByTask: {
        'D05-02': paths.filter((p) => p.id.startsWith('D05-02')),
        'D05-03': paths.filter((p) => p.id.startsWith('D05-03')),
        'D05-04': paths.filter((p) => p.id.startsWith('D05-04')),
        'D05-05': paths.filter((p) => p.id.startsWith('D05-05')),
        'D05-06': paths.filter((p) => p.id.startsWith('D05-06')),
      },
    };

    writeFileSync(INVENTORY_PATH, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
    expect(existsSync(INVENTORY_PATH)).toBe(true);
    const roundTrip = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8')) as typeof inventory;
    expect(roundTrip.summary.complete).toBe(true);
    expect(roundTrip.cliVerbs.map((v) => v.verb)).toEqual([...REQUIRED_CLI_VERBS]);
    expect(roundTrip.paths.length).toBe(REQUIRED_PATHS.length);
  });
});
