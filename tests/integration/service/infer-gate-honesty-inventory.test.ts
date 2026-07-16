/**
 * REDHAT-FIX-H2 — Honest human gate inventory (docs ↔ CLI parity, no greenwash).
 *
 * AC-1..AC-5 / TC-1..TC-5
 *
 * NEGATIVE CONTROL (would fail if):
 * - SPRINT.md still contains `holo mission run triage`
 * - inventory greps only comments / static empty pass without reading SPRINT.md
 * - documented command has no holo case
 * - vitest path claimed as CLI human step without suite label
 * - greenwash fixture (mission wording + vitest-only exec) still validates as pass
 * - degraded step still claims mid-run mission fleet kill without suite label
 * - never-cloud language dropped from degraded step
 * - no redhat-fix-h2* red+green evidence
 *
 * Run:
 *   PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-gate-honesty-inventory.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOLO_CLI, PLATFORM_IT, REPO_ROOT } from './harness';

const itLive = PLATFORM_IT ? it : it.skip;

const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-08-role-router-local-first-and-degraded-modes'
);
const SPRINT_MD = resolve(SPRINT_DIR, 'SPRINT.md');
const HUMAN_GATE_MD = resolve(SPRINT_DIR, 'HUMAN-GATE.md');
const GATE_RESULTS = resolve(SPRINT_DIR, 'gate-results.json');
const SPEC_EVIDENCE = resolve(REPO_ROOT, '.spec/evidence');
const TMP_EVIDENCE = resolve(REPO_ROOT, '.tmp/REDHAT-FIX-H2');

type StepKind = 'cli' | 'suite' | 'mixed' | 'unknown';

type ParsedStep = {
  n: number;
  text: string;
  kind: StepKind;
  holoCommands: string[];
  suiteCommands: string[];
  labeledSuite: boolean;
};

type GateStep = {
  id?: string;
  name?: string;
  command?: string;
  kind?: string;
  label?: string;
  executed?: boolean;
  result?: string;
  log?: string;
};

type HonestyResult = {
  ok: boolean;
  reason: string;
  details: string[];
};

function writeArtifact(name: string, body: unknown): string {
  mkdirSync(TMP_EVIDENCE, { recursive: true });
  mkdirSync(SPEC_EVIDENCE, { recursive: true });
  const text = typeof body === 'string' ? body : JSON.stringify(body, null, 2);
  const withNl = text.endsWith('\n') ? text : `${text}\n`;
  const tmpPath = resolve(TMP_EVIDENCE, name);
  writeFileSync(tmpPath, withNl, 'utf8');
  if (name === 'green.json' || name === 'inventory-pass.json') {
    writeFileSync(resolve(SPEC_EVIDENCE, `redhat-fix-h2-green.json`), withNl, 'utf8');
  }
  return tmpPath;
}

function extractHumanSection(sprintMd: string): string {
  const start = sprintMd.indexOf('## Human Test Deliverable');
  if (start < 0) {
    throw new Error('SPRINT.md missing ## Human Test Deliverable');
  }
  // Stop at next top-level ## that is not a subsection under human deliverable
  const rest = sprintMd.slice(start);
  const endMatch = rest.search(/\n## (?!Human)/);
  return endMatch >= 0 ? rest.slice(0, endMatch) : rest;
}

function extractTestStepsBlock(humanSection: string): string {
  const m = humanSection.match(/\*\*Test Steps:\*\*([\s\S]*?)(?=\n---|\n## |$)/);
  if (!m) {
    throw new Error('SPRINT.md missing **Test Steps:** block');
  }
  return m[1] ?? '';
}

function parseHoloCommands(text: string): string[] {
  // Match holo <case> possibly after bun; capture case token (may include colon)
  const re = /\b(?:bun\s+)?holo\s+([a-z][a-z0-9:-]*)/gi;
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const cmd = (m[1] ?? '').toLowerCase();
    if (cmd && !out.includes(cmd)) out.push(cmd);
  }
  return out;
}

function parseSuiteCommands(text: string): string[] {
  const out: string[] = [];
  // PLATFORM_IT=1 pnpm vitest run <paths...>
  const re =
    /PLATFORM_IT\s*=\s*1\s+pnpm\s+vitest\s+run\s+[^\n`]+|pnpm\s+vitest\s+run\s+[^\n`]+|vitest\s+run\s+[^\n`]+/gi;
  for (const m of text.matchAll(re)) {
    const cmd = m[0].trim();
    if (cmd && !out.includes(cmd)) out.push(cmd);
  }
  return out;
}

function isSuiteLabeled(text: string): boolean {
  return /\b(suite|platform_it|vitest)\b/i.test(text) || /\[SUITE\]/i.test(text);
}

function parseSteps(testStepsBlock: string): ParsedStep[] {
  const lines = testStepsBlock.split('\n');
  const steps: ParsedStep[] = [];
  let current: { n: number; lines: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (m) {
      if (current) {
        steps.push(finalizeStep(current.n, current.lines.join('\n')));
      }
      current = { n: Number(m[1]), lines: [m[2] ?? ''] };
      continue;
    }
    if (current && line.trim() !== '') {
      current.lines.push(line);
    }
  }
  if (current) {
    steps.push(finalizeStep(current.n, current.lines.join('\n')));
  }
  return steps;
}

function finalizeStep(n: number, text: string): ParsedStep {
  const holoCommands = parseHoloCommands(text);
  const suiteCommands = parseSuiteCommands(text);
  const labeledSuite = isSuiteLabeled(text) || /\[SUITE\]/i.test(text);
  let kind: StepKind = 'unknown';
  if (holoCommands.length > 0 && suiteCommands.length > 0) kind = 'mixed';
  else if (suiteCommands.length > 0 || (labeledSuite && holoCommands.length === 0)) kind = 'suite';
  else if (holoCommands.length > 0) kind = 'cli';
  // Observation-only steps that only refer to suite artifacts still count as suite if labeled
  if (kind === 'unknown' && labeledSuite) kind = 'suite';
  // Steps that only mention reading capture but reference suite language
  if (kind === 'unknown' && /anthropicCount|network\s+assertion|zero\s+Anthropic/i.test(text)) {
    kind = labeledSuite ? 'suite' : 'unknown';
  }
  return { n, text, kind, holoCommands, suiteCommands, labeledSuite };
}

function listHoloCases(holoTsSource: string): Set<string> {
  const cases = new Set<string>();
  for (const m of holoTsSource.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g)) {
    cases.add((m[1] ?? '').toLowerCase());
  }
  return cases;
}

function mapSteps(
  steps: ParsedStep[],
  holoCases: Set<string>
): {
  mapped: Array<{
    n: number;
    mapped: boolean;
    kind: StepKind;
    reason: string;
    holoCommands: string[];
    suiteCommands: string[];
  }>;
  mapped_steps_count: number;
  unmapped_steps_count: number;
} {
  const mapped = steps.map((s) => {
    // CLI commands must all exist
    const missing = s.holoCommands.filter((c) => !holoCases.has(c));
    // Mission is always unmapped unless Sprint 15 (explicit ban)
    const hasMission = s.holoCommands.some((c) => c === 'mission' || c.startsWith('mission:'));
    if (hasMission) {
      return {
        n: s.n,
        mapped: false,
        kind: s.kind,
        reason: 'mission CLI is Sprint 15 — not executable in Sprint 08',
        holoCommands: s.holoCommands,
        suiteCommands: s.suiteCommands,
      };
    }

    if (missing.length > 0) {
      return {
        n: s.n,
        mapped: false,
        kind: s.kind,
        reason: `missing holo cases: ${missing.join(', ')}`,
        holoCommands: s.holoCommands,
        suiteCommands: s.suiteCommands,
      };
    }

    // Pure suite / suite-labeled steps require honest suite labeling
    if (s.suiteCommands.length > 0 && !s.labeledSuite) {
      return {
        n: s.n,
        mapped: false,
        kind: s.kind,
        reason: 'suite/vitest command without suite|PLATFORM_IT|vitest label (greenwash risk)',
        holoCommands: s.holoCommands,
        suiteCommands: s.suiteCommands,
      };
    }

    // Observation-only suite steps (no explicit command) ok if labeled suite
    if (s.holoCommands.length === 0 && s.suiteCommands.length === 0) {
      if (s.labeledSuite) {
        return {
          n: s.n,
          mapped: true,
          kind: s.kind,
          reason: 'labeled suite observation step',
          holoCommands: s.holoCommands,
          suiteCommands: s.suiteCommands,
        };
      }
      return {
        n: s.n,
        mapped: false,
        kind: s.kind,
        reason: 'no holo CLI case and no labeled suite command',
        holoCommands: s.holoCommands,
        suiteCommands: s.suiteCommands,
      };
    }

    // CLI-only mapped when all cases present
    if (s.holoCommands.length > 0) {
      return {
        n: s.n,
        mapped: true,
        kind: s.kind,
        reason: 'holo CLI case(s) present',
        holoCommands: s.holoCommands,
        suiteCommands: s.suiteCommands,
      };
    }

    // Suite-only with label
    if (s.suiteCommands.length > 0 && s.labeledSuite) {
      return {
        n: s.n,
        mapped: true,
        kind: s.kind,
        reason: 'honestly labeled PLATFORM_IT/suite command',
        holoCommands: s.holoCommands,
        suiteCommands: s.suiteCommands,
      };
    }

    return {
      n: s.n,
      mapped: false,
      kind: s.kind,
      reason: 'unmapped',
      holoCommands: s.holoCommands,
      suiteCommands: s.suiteCommands,
    };
  });

  const mapped_steps_count = mapped.filter((m) => m.mapped).length;
  const unmapped_steps_count = mapped.filter((m) => !m.mapped).length;
  return { mapped, mapped_steps_count, unmapped_steps_count };
}

/**
 * Honesty validator: compare SPRINT documented entry points vs gate-results step commands.
 * Fails greenwash: mission-doc / non-executable claim + vitest execution without honest suite label.
 */
function validateGateHonesty(opts: {
  sprintHumanSection: string;
  gateResults: { verdict?: string; steps?: GateStep[] };
}): HonestyResult {
  const details: string[] = [];
  const steps = opts.gateResults.steps ?? [];
  const human = opts.sprintHumanSection;
  // Ban executable mission CLI tokens (holo mission …). Narrative "mission engine is Sprint 15" is OK.
  const hasMissionInDocs = /\bholo\s+mission(?:\s+run)?\b/i.test(human);
  let failed = false;

  // Human procedure must forbid greenwash
  if (!existsSync(HUMAN_GATE_MD)) {
    failed = true;
    details.push('HUMAN-GATE.md missing — gate procedure required for honesty');
  } else {
    const proc = readFileSync(HUMAN_GATE_MD, 'utf8');
    if (!/greenwash|non-executable|honesty/i.test(proc)) {
      failed = true;
      details.push('HUMAN-GATE.md lacks greenwash/honesty/non-executable language');
    } else {
      details.push('HUMAN-GATE.md forbids greenwash pass on non-executable docs');
    }
  }

  if (hasMissionInDocs) {
    failed = true;
    details.push(
      'SPRINT human section documents non-executable holo mission — honesty validation fail'
    );
  }

  for (const gs of steps) {
    const blob = `${gs.id ?? ''} ${gs.name ?? ''} ${gs.command ?? ''} ${gs.kind ?? ''} ${gs.label ?? ''}`;
    const cmd = gs.command ?? '';
    const isVitest =
      /\bvitest\b/i.test(cmd) ||
      /\bPLATFORM_IT\s*=\s*1\b/i.test(cmd) ||
      /\bpnpm\s+vitest\b/i.test(cmd);
    const suiteLabeled =
      /\b(suite|platform_it|vitest)\b/i.test(blob) ||
      gs.kind === 'suite' ||
      /suite/i.test(gs.label ?? '');
    // "mission" in disclaimers ("not mission", "not mid-run mission", Sprint 15 notes) is OK
    const claimsMission =
      /\bmission\b/i.test(blob) &&
      !/not[^.()]*\bmission\b|no\s+mission|sprint\s+15|suite_not_mission|\(not\b/i.test(blob);
    const claimsMidRunFleetKill =
      /mid-run|fleet\s*kill|take\s+the\s+divergent\s+endpoint\s+down/i.test(blob) &&
      !/suite|controller|PLATFORM_IT|not\s+live|honest|\(not\b/i.test(blob);

    if (isVitest && claimsMission) {
      failed = true;
      details.push(
        `greenwash: step ${gs.id ?? '?'} claims mission while command is vitest (non-executable mission substitution)`
      );
    } else if (isVitest && !suiteLabeled) {
      failed = true;
      details.push(
        `greenwash: step ${gs.id ?? '?'} runs vitest without suite|PLATFORM_IT|vitest honest label`
      );
    } else if (claimsMidRunFleetKill && isVitest) {
      failed = true;
      details.push(
        `greenwash: step ${gs.id ?? '?'} claims mid-run fleet kill while executing vitest without honesty disclaimer`
      );
    } else if (isVitest && suiteLabeled) {
      details.push(`honest suite-labeled step ${gs.id ?? '?'}: ok`);
    } else if (/\bholo\s+/.test(cmd)) {
      details.push(`cli step ${gs.id ?? '?'}: ok`);
    }
  }

  // If docs still document mission and gate claims pass overall — fail
  if (hasMissionInDocs && opts.gateResults.verdict === 'pass') {
    failed = true;
    details.push(
      'verdict:pass while SPRINT still contains non-executable holo mission (greenwash)'
    );
  }

  if (failed) {
    return {
      ok: false,
      reason: 'greenwash or honesty/non-executable mismatch',
      details,
    };
  }
  return { ok: true, reason: 'honest', details };
}

function loadCurrentArtifacts(): {
  sprint: string;
  human: string;
  stepsBlock: string;
  steps: ParsedStep[];
  holoCases: Set<string>;
  mapping: ReturnType<typeof mapSteps>;
  gateResults: { verdict?: string; steps?: GateStep[] };
} {
  const sprint = readFileSync(SPRINT_MD, 'utf8');
  const human = extractHumanSection(sprint);
  const stepsBlock = extractTestStepsBlock(human);
  const steps = parseSteps(stepsBlock);
  const holoTs = readFileSync(HOLO_CLI, 'utf8');
  const holoCases = listHoloCases(holoTs);
  const mapping = mapSteps(steps, holoCases);
  let gateResults: { verdict?: string; steps?: GateStep[] } = {};
  if (existsSync(GATE_RESULTS)) {
    gateResults = JSON.parse(readFileSync(GATE_RESULTS, 'utf8')) as typeof gateResults;
  }
  return { sprint, human, stepsBlock, steps, holoCases, mapping, gateResults };
}

describe('REDHAT-FIX-H2: infer gate honesty inventory', () => {
  itLive('AC-1: SPRINT human steps drop non-existent mission CLI; include infer:call', () => {
    const { human, stepsBlock, steps } = loadCurrentArtifacts();
    // Inventory greps the real Test Steps block (not comments alone / static empty pass).
    const missionInSteps = stepsBlock.match(/\bholo\s+mission(?:\s+run)?\b/gi) ?? [];
    const missionAnywhere = human.match(/\bholo\s+mission(?:\s+run)?\b/gi) ?? [];
    expect(
      missionInSteps,
      `mission CLI still present in Test Steps: ${missionInSteps.join(', ')}`
    ).toHaveLength(0);
    expect(
      missionAnywhere,
      `mission CLI token still present in Human Test Deliverable: ${missionAnywhere.join(', ')}`
    ).toHaveLength(0);
    expect(human).toMatch(/infer:call/);
    expect(stepsBlock).toMatch(/infer:call/);
    expect(human).not.toMatch(/holo mission run triage/i);
    // Default-path step should name infer:call or labeled suite
    const step1 = steps.find((s) => s.n === 1);
    expect(step1, 'step 1 missing').toBeDefined();
    if (!step1) throw new Error('step 1 missing');
    expect(
      step1.holoCommands.includes('infer:call') || step1.labeledSuite,
      'default-path step must use infer:call or labeled suite'
    ).toBe(true);

    writeArtifact('AC-1-no-mission.json', {
      mission_command_count: missionInSteps.length,
      mission_anywhere_count: missionAnywhere.length,
      has_infer_call: /infer:call/.test(human),
      steps_block_length: stepsBlock.length,
      step1,
    });
  });

  itLive('AC-2: every documented human step maps to real CLI or labeled suite', () => {
    const { steps, holoCases, mapping } = loadCurrentArtifacts();
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(holoCases.has('infer:call')).toBe(true);
    expect(holoCases.has('verify:no-provider-refs')).toBe(true);
    expect(mapping.mapped_steps_count).toBeGreaterThanOrEqual(5);
    expect(mapping.unmapped_steps_count).toBe(0);
    expect(mapping.mapped.length).toBeGreaterThan(0);

    // No empty mapping table; no unmapped mission
    for (const m of mapping.mapped) {
      expect(m.mapped, `step ${m.n} unmapped: ${m.reason}`).toBe(true);
      expect(m.holoCommands.some((c) => c === 'mission' || c.startsWith('mission:'))).toBe(false);
    }

    writeArtifact('AC-2-step-map.json', {
      mapped_steps_count: mapping.mapped_steps_count,
      unmapped_steps_count: mapping.unmapped_steps_count,
      mapping: mapping.mapped,
      holo_cases_sample: ['infer:call', 'verify:no-provider-refs', 'infer:degraded'].filter((c) =>
        holoCases.has(c)
      ),
    });
  });

  itLive(
    'AC-3: honesty validator fails greenwash fixture and passes honest suite-labeled fixture',
    () => {
      const { human, gateResults } = loadCurrentArtifacts();

      // Synthetic greenwash: mission claim + vitest execution (historical H2 pattern)
      const greenwashFixture = {
        verdict: 'pass' as const,
        steps: [
          {
            id: 'step-1-2',
            name: 'Fleet mission/router default path zero Anthropic',
            command: 'PLATFORM_IT=1 pnpm vitest run infer-router-zero-cloud + infer-red-zero-cloud',
            executed: true,
            result: 'pass',
          },
          {
            id: 'step-6',
            name: 'Take divergent endpoint down mid-run mission fleet kill',
            command: 'PLATFORM_IT=1 vitest infer-degraded-transition + resume',
            executed: true,
            result: 'pass',
          },
        ],
      };
      // Pair greenwash gate with mission-doc human section
      const greenwashHuman = `${human}\n\n**LEGACY FICTION (must fail):** Run \`holo mission run triage --goal 'X'\` mid-run.`;
      const greenwashResult = validateGateHonesty({
        sprintHumanSection: greenwashHuman,
        gateResults: greenwashFixture,
      });
      expect(greenwashResult.ok, JSON.stringify(greenwashResult)).toBe(false);
      expect(greenwashResult.reason + greenwashResult.details.join(' ')).toMatch(
        /greenwash|honesty|non-executable/i
      );

      // Honest suite-labeled fixture matching rewritten surface
      const honestFixture = {
        verdict: 'pass' as const,
        steps: [
          {
            id: 'step-1',
            name: '[CLI] infer:call default path divergent',
            kind: 'cli',
            label: 'CLI',
            command: 'bun holo infer:call --role divergent --json',
            executed: true,
            result: 'pass',
          },
          {
            id: 'step-2',
            name: '[SUITE] PLATFORM_IT zero-cloud suite (not mission)',
            kind: 'suite',
            label: 'SUITE',
            command:
              'PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-router-zero-cloud.test.ts tests/integration/service/infer-red-zero-cloud.test.ts',
            executed: true,
            result: 'pass',
          },
          {
            id: 'step-6',
            name: '[SUITE] degraded never-cloud controller suite (not mid-run mission fleet kill)',
            kind: 'suite',
            label: 'SUITE',
            command:
              'PLATFORM_IT=1 pnpm vitest run tests/integration/service/infer-degraded-transition.test.ts tests/integration/service/infer-degraded-resume.test.ts',
            executed: true,
            result: 'pass',
          },
        ],
      };
      const honestHuman = human; // rewritten — no mission
      const honestResult = validateGateHonesty({
        sprintHumanSection: honestHuman,
        gateResults: honestFixture,
      });
      expect(honestResult.ok, JSON.stringify(honestResult)).toBe(true);

      // Live gate-results after remediation must also pass honesty
      const live = validateGateHonesty({
        sprintHumanSection: human,
        gateResults,
      });
      expect(live.ok, `live gate-results honesty fail: ${JSON.stringify(live)}`).toBe(true);

      writeArtifact('AC-3-honesty-validator.json', {
        greenwash_fixture_validation: { result: 'fail', ...greenwashResult },
        honest_suite_labeled_fixture_validation: { result: 'pass', ...honestResult },
        live_gate_results_validation: live,
        validator_literals: 'greenwash honesty non-executable',
      });
    }
  );

  itLive('AC-4: degraded/mid-run step is honest post-fix surface (never-cloud + suite/CLI)', () => {
    const { steps } = loadCurrentArtifacts();
    // Prefer step 6; else find degraded-related step
    const degraded =
      steps.find((s) => s.n === 6) ??
      steps.find((s) => /degraded|fleet-down|never-cloud|resume/i.test(s.text));
    expect(degraded, 'degraded human step missing').toBeDefined();
    if (!degraded) throw new Error('degraded human step missing');
    const text = degraded.text;
    expect(text).toMatch(/never-cloud|zero\s+Anthropic|anthropicCount\s*:\s*0/i);
    expect(
      degraded.labeledSuite ||
        degraded.holoCommands.includes('infer:degraded') ||
        degraded.holoCommands.includes('infer:call') ||
        /controller|infer-degraded/i.test(text),
      'degraded step must be labeled suite or real controller/CLI path'
    ).toBe(true);
    expect(text).not.toMatch(/holo mission/i);
    // Must not claim undocumented mid-run mission fleet kill as sole step
    const claimsFictionOnly =
      /take\s+the\s+divergent\s+endpoint\s+down\s+mid-run/i.test(text) &&
      !degraded.labeledSuite &&
      degraded.suiteCommands.length === 0;
    expect(claimsFictionOnly).toBe(false);

    writeArtifact('AC-4-degraded-honest.json', {
      step: degraded,
      never_cloud_language: true,
      labeled_suite_or_cli: true,
    });
  });

  itLive('AC-5: redhat-fix-h2* red and green evidence artifacts present', () => {
    const { mapping, human, gateResults } = loadCurrentArtifacts();
    const redPath = resolve(SPEC_EVIDENCE, 'redhat-fix-h2-red.json');
    expect(existsSync(redPath), 'missing .spec/evidence/redhat-fix-h2-red.json').toBe(true);
    const red = JSON.parse(readFileSync(redPath, 'utf8')) as Record<string, unknown>;
    expect(Object.keys(red).length).toBeGreaterThan(0);
    expect(JSON.stringify(red)).toMatch(/greenwash|mission|vitest|step-1-2|step-6/i);

    const greenBody = {
      task: 'REDHAT-FIX-H2',
      kind: 'green_honest_inventory',
      capturedAt: new Date().toISOString(),
      inventory_pass: true,
      unmapped_steps_count: mapping.unmapped_steps_count,
      mapped_steps_count: mapping.mapped_steps_count,
      mission_cli_in_human_steps: /\bholo\s+mission(?:\s+run)?\b/i.test(human),
      gate_verdict: gateResults.verdict ?? null,
      honesty: validateGateHonesty({
        sprintHumanSection: human,
        gateResults,
      }),
      mapping: mapping.mapped,
      must_observe_green: {
        inventory_pass: true,
        unmapped_steps_count: 0,
        no_mission_cli: true,
      },
    };
    expect(greenBody.unmapped_steps_count).toBe(0);
    expect(greenBody.mission_cli_in_human_steps).toBe(false);
    expect(greenBody.honesty.ok).toBe(true);

    writeArtifact('green.json', greenBody);
    writeArtifact('inventory-pass.json', greenBody);

    // Enumerate evidence matching contract pattern
    const files = readdirSync(SPEC_EVIDENCE).filter((f) => f.startsWith('redhat-fix-h2'));
    expect(files.some((f) => f.includes('red'))).toBe(true);
    expect(files.some((f) => f.includes('green'))).toBe(true);

    const greenOnDisk = JSON.parse(
      readFileSync(resolve(SPEC_EVIDENCE, 'redhat-fix-h2-green.json'), 'utf8')
    ) as { inventory_pass?: boolean; unmapped_steps_count?: number };
    expect(greenOnDisk.inventory_pass === true || greenOnDisk.unmapped_steps_count === 0).toBe(
      true
    );
  });
});
