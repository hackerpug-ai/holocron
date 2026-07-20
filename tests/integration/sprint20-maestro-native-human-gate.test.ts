import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sprintDir =
  '.spec/prds/mk6-migration/tasks/sprint-20-e2e-maestro-harness-and-cold-boot-reference-flow';
const planPath = `${sprintDir}/gate-plan.json`;
const gateRunner = 'scripts/e2e/run-sprint20-native-human-gate.sh';
const nativeHarness = 'scripts/e2e/run-maestro-native-gate.sh';
const sharedSkillRoot =
  process.env.KB_RUN_HUMAN_TESTS_SKILL_ROOT ?? '/Users/inference1/.codex/skills/kb-run-human-tests';

const plan = JSON.parse(readFileSync(planPath, 'utf8')) as {
  project_root: string;
  planned_steps: number;
  ui_driver_resolution: { resolved_driver: string };
  steps: Array<{
    n: number;
    type: string;
    method: string;
    literal_cmd: string | null;
    native?: {
      driver: string;
      runner: string;
      flow: string;
      action_id: string;
      action_count: number;
      evidence_file: string;
      args: string[];
    };
    assertion: { kind: string; expect_log_regex?: string };
  }>;
};

describe('Sprint 20 explicit native Maestro human gate', () => {
  it('declares three one-action native steps with distinct scoped flows and evidence wiring', () => {
    expect(plan.planned_steps).toBe(6);
    expect(plan.ui_driver_resolution.resolved_driver).toBe('maestro-ios');

    const nativeSteps = plan.steps.filter((step) => step.n <= 3);
    expect(nativeSteps).toHaveLength(3);
    expect(new Set(nativeSteps.map((step) => step.native?.flow)).size).toBe(3);

    for (const step of nativeSteps) {
      expect(step.type).toBe('native-ui');
      expect(step.method).toBe('real-native-ui');
      expect(step.literal_cmd).toBeNull();
      expect(step.assertion.kind).toBe('maestro_native');
      expect(step.native?.driver).toBe('maestro-ios');
      expect(step.native?.runner).toBe(nativeHarness);
      expect(step.native?.action_count).toBe(1);
      expect(step.native?.action_id).toBeTruthy();
      expect(step.native?.evidence_file).toContain('__EVIDENCE_DIR__');
      expect(step.native?.args).toContain('__STEP__');
      expect(step.native?.args).toContain('__FLOW__');
      expect(step.native?.args).toContain('__STEP_DIR__/maestro-evidence.json');
      expect(step.native?.flow).toMatch(/^\.e2e\/maestro\/gate\/step-[123]-/);
      expect(step.native?.flow).not.toBe('.e2e/maestro/reference-flow.yaml');
    }
  });

  it('keeps terminal checks separate from the native action steps', () => {
    const terminalSteps = plan.steps.filter((step) => step.n >= 4);
    expect(terminalSteps).toHaveLength(3);
    expect(terminalSteps.every((step) => step.type === 'terminal')).toBe(true);
    expect(terminalSteps.map((step) => step.assertion.kind)).toEqual([
      'exit_and_log_regex',
      'exit_and_log_regex',
      'exit_and_log_regex',
    ]);
    expect(terminalSteps[0]?.literal_cmd).toContain('E2E_CI_ARTIFACT_DIR');
    expect(terminalSteps[0]?.assertion.expect_log_regex ?? '').toContain('coldboot_gate');
    expect(terminalSteps[1]?.literal_cmd).toContain('EXPO_DEV_BUILD_PATH=');
    expect(terminalSteps[2]?.literal_cmd).toBe('scripts/e2e/reset-and-verify-zero.sh');
    expect(readFileSync(terminalSteps[2]!.literal_cmd!, 'utf8')).toContain(
      'namespace reset --json'
    );
  });

  it('passes the native gate adapter static preflight', () => {
    const result = spawnSync(gateRunner, ['--check'], { encoding: 'utf8' });
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, driver: 'maestro-ios' });
  });

  it('binds the real Maestro invocation and explicit native verifier to the plan', () => {
    const harnessSource = readFileSync(nativeHarness, 'utf8');
    const gateRunnerSource = readFileSync(gateRunner, 'utf8');
    const verifierSource = readFileSync(
      `${sharedSkillRoot}/references/verify-gate-evidence.sh`,
      'utf8'
    );
    const qaSource = readFileSync(
      `${sharedSkillRoot}/references/test-verify-gate-evidence.sh`,
      'utf8'
    );

    expect(harnessSource).toContain('maestro --device "$device_udid" test "$flow"');
    expect(harnessSource).toContain('driver:"maestro-ios"');
    expect(gateRunnerSource).toContain('sprint_verification="$sprint_dir/gate-verification.json"');
    expect(verifierSource).toContain('maestro_native)');
    expect(verifierSource).toContain('if (.gate_runner | has("timed_out"))');
    expect(verifierSource).toContain('native-driver-mismatch');
    expect(qaSource).toContain('[GREEN3] explicit native Maestro action');
    expect(qaSource).toContain('[RED10] browser driver cannot satisfy native Maestro plan');

    // The QA fixture itself is executed by the shared skill test; this keeps
    // the project contract tied to the deterministic verifier's regression.
    execFileSync('bash', [`${sharedSkillRoot}/references/test-verify-gate-evidence.sh`], {
      stdio: 'ignore',
    });
  }, 120_000);
});
