/**
 * GATE-FIX-S28R3-QA32 — trusted PITR probing and ambient-free real consumers.
 *
 * The live case is credential-gated from an ignored operator secret file. It
 * never fabricates provider or Docker success. The no-key case always runs
 * with a disposable empty secret file and must fail before a restore artifact
 * can be produced.
 */
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  chownSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const SPRINT_DIR = resolve(
  REPO_ROOT,
  '.spec/prds/mk6-migration/tasks/sprint-28-point-in-time-restore-and-fresh-hardware-fire-drill'
);
const PROVISION = resolve(REPO_ROOT, 'scripts/provision-fresh-restore-target.sh');
const FIRE_DRILL = resolve(REPO_ROOT, 'scripts/run-fire-drill-on-fresh-target.sh');
const QA30_TEST = resolve(
  REPO_ROOT,
  'services/platform/tests/integration/sprint28-s28r3-qa30-gate-fix.test.ts'
);
const HOLO_CLI = resolve(REPO_ROOT, 'services/platform/src/cli/holo.ts');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.tmp/GATE-FIX-S28R3-QA32');
const TRUSTED_BUN_PATH = '/usr/local/bin/bun';
const BUN_DEPENDENCY_FAILURE = 'DEPENDENCY-S28R3-QA32-BUN-TRUST';

const SECRET_KEYS = new Set([
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_SESSION_TOKEN',
  'R2_RESTORE_ACCESS_KEY_ID',
  'R2_RESTORE_SECRET_ACCESS_KEY',
  'R2_RESTORE_SESSION_TOKEN',
  'R2_ENDPOINT',
  'R2_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_REPO_CIPHER_PASS',
  'RESTIC_PASSWORD',
  'R2_RESTIC_PREFIX',
  'PGBACKREST_STANZA',
  'R2_CREDENTIAL_POLICY',
]);

const CONFIG_ENV_KEYS = new Set([
  ...SECRET_KEYS,
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_SESSION_TOKEN',
]);

const AMBIENT_KEYS = new Set([
  'ALLOW_PLACEHOLDER_R2_RO',
  'BUN_BIN',
  'HOLO_CLI',
  'HOLO_FIRE_DRILL_FAKE_VOLUMES',
  'HOLO_PROVE_R2_READONLY',
  'HOLO_QA_PROOF_MUTATE',
  'PGBACKREST_BIN',
  'RESTIC_BIN',
]);

type SecretValues = Record<string, string>;

type SecretConfig = {
  path: string;
  values: SecretValues;
};

type CommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  error: string;
};

type ConsumerRun = CommandResult & {
  prefixVariablesInitiallyUnset: boolean;
  explicitPrefixTuple: boolean;
  placeholderEscapeInjected: boolean;
};

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseSecretFile(path: string): SecretValues {
  const values: SecretValues = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const yaml = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*?)\s*$/);
    const dotenv = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    const match = yaml ?? dotenv;
    if (!match) continue;
    const key = match[1];
    if (!SECRET_KEYS.has(key)) continue;
    values[key] = stripQuotes(match[2]);
  }
  return values;
}

function absoluteCandidate(path: string): string {
  return path.startsWith('/') ? path : resolve(REPO_ROOT, path);
}

function discoverSecretConfig(): SecretConfig | null {
  const explicitSecretPath = process.env.HOLO_QA31_SECRETS_PATH?.trim();
  const candidates = [
    explicitSecretPath,
    resolve(REPO_ROOT, 'services/platform/config/secrets.yaml'),
    resolve(REPO_ROOT, '.env'),
  ].filter((candidate): candidate is string => Boolean(candidate));

  let firstReadable: SecretConfig | null = null;
  for (const candidate of [...new Set(candidates)].map(absoluteCandidate)) {
    if (!existsSync(candidate)) continue;
    let values: SecretValues;
    try {
      values = parseSecretFile(candidate);
    } catch {
      continue;
    }
    const config = { path: candidate, values };
    firstReadable ??= config;
    if (values.R2_RESTORE_ACCESS_KEY_ID || values.R2_RESTORE_SECRET_ACCESS_KEY) {
      return config;
    }
  }
  return firstReadable;
}

function isPlaceholder(value: string): boolean {
  return /(?:^|[-_])(ro-test|placeholder|replace-me|example|not-for-prod|test-key|test-secret)(?:$|[-_])/i.test(
    value
  );
}

function credentialGate(config: SecretConfig | null) {
  const values = config?.values ?? {};
  const restoreAccessKey = values.R2_RESTORE_ACCESS_KEY_ID ?? '';
  const restoreSecret = values.R2_RESTORE_SECRET_ACCESS_KEY ?? '';
  const restoreSession = values.R2_RESTORE_SESSION_TOKEN ?? '';
  const writerAccessKey = values.R2_ACCESS_KEY_ID ?? '';
  const writerSecret = values.R2_SECRET_ACCESS_KEY ?? '';
  const hasRestoreTuple = Boolean(restoreAccessKey && restoreSecret);
  const placeholder = isPlaceholder(restoreAccessKey) || isPlaceholder(restoreSecret);
  const exactWriterTuple =
    Boolean(writerAccessKey && writerSecret) &&
    restoreAccessKey === writerAccessKey &&
    restoreSecret === writerSecret;
  const sameParentWithoutSession =
    Boolean(writerAccessKey && restoreAccessKey === writerAccessKey) && !restoreSession;
  const distinct = !exactWriterTuple && !sameParentWithoutSession;
  const available = Boolean(config && hasRestoreTuple && !placeholder && distinct);

  let reason = 'distinct live R2_RESTORE_* credentials are available';
  if (!config) reason = 'no ignored secret configuration is readable';
  else if (!hasRestoreTuple) reason = 'R2_RESTORE_ACCESS_KEY_ID/SECRET_ACCESS_KEY are absent';
  else if (placeholder) reason = 'R2_RESTORE_* values are placeholders';
  else if (exactWriterTuple) reason = 'restore tuple equals the configured writer tuple';
  else if (sameParentWithoutSession)
    reason = 'same parent access key requires a non-empty restore session token';

  return {
    configFound: Boolean(config),
    configBasename: config ? basename(config.path) : null,
    restoreAccessKeyPresent: Boolean(restoreAccessKey),
    restoreSecretPresent: Boolean(restoreSecret),
    restoreTupleDistinct: distinct,
    available,
    reason,
  };
}

function redact(text: string, secretValues: string[] = []): string {
  let output = text;
  for (const value of [...new Set(secretValues)].filter((candidate) => candidate.length >= 4)) {
    output = output.replaceAll(value, '[redacted]');
  }
  return output
    .replace(
      /((?:access[_-]?key|secret|session[_-]?token|password|cipher[_-]?pass)\s*[=:]\s*)\S+/gi,
      '$1[redacted]'
    )
    .replace(/\b(AKIA[A-Z0-9]{8,}|sk-[a-z0-9_-]{8,})\b/gi, '[redacted-token]');
}

function writeEvidence(name: string, body: unknown, secretValues: string[] = []): string {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, name);
  const text = redact(`${JSON.stringify(body, null, 2)}\n`, secretValues);
  writeFileSync(path, text, 'utf8');
  return path;
}

function ambientFreeEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith('R2_') ||
      key.startsWith('PGBACKREST_') ||
      key.startsWith('RESTIC_') ||
      key.startsWith('HOLO_SECRETS') ||
      key.startsWith('HOLOCRON_SECRETS') ||
      key.startsWith('ALLOW_PLACEHOLDER_R2_RO')
    ) {
      delete env[key];
    }
  }
  for (const key of AMBIENT_KEYS) delete env[key];
  env.PATH = '/usr/bin:/bin';
  // Keep the operator's Docker context discoverable while still removing all
  // credential/prefix ambient state; the child consumer explicitly allowlists
  // HOME but does not forward arbitrary Docker transport variables.
  env.HOME = process.env.HOME ?? '/tmp';
  env.LC_ALL = 'C';
  const explicitDockerHost = dockerContextHost();
  if (explicitDockerHost) env.DOCKER_HOST = explicitDockerHost;
  const explicitDockerConfig = '/opt/homebrew/opt/docker-compose/lib/docker';
  if (existsSync(join(explicitDockerConfig, 'cli-plugins', 'docker-compose')))
    env.DOCKER_CONFIG = explicitDockerConfig;
  return env;
}

function envForConfig(config: SecretConfig, stagingRoot: string): NodeJS.ProcessEnv {
  const env = ambientFreeEnv();
  for (const [key, value] of Object.entries(config.values)) {
    if (CONFIG_ENV_KEYS.has(key) && value) env[key] = value;
  }
  env.HOLO_SECRETS_PATH = config.path;
  env.HOLOCRON_SECRETS_PATH = config.path;
  env.STAGING_ROOT = stagingRoot;
  env.MINI_HOST = '203.0.113.1';
  env.HOLO_FIRE_DRILL_LOCKDIR = resolve(stagingRoot, 'fire-drill.lockdir');
  return env;
}

function runRealConsumer(
  script: string,
  args: string[],
  baseEnv: NodeJS.ProcessEnv,
  explicitPrefixTuple: boolean
): ConsumerRun {
  const initialPrefixVariablesUnset =
    !baseEnv.R2_RESTORE_OBJECT_PREFIX && !baseEnv.R2_PGBACKREST_PREFIX;
  const childEnv = { ...baseEnv };
  delete childEnv.R2_RESTORE_OBJECT_PREFIX;
  delete childEnv.R2_PGBACKREST_PREFIX;

  const launcherArgs = ['-u', 'R2_RESTORE_OBJECT_PREFIX', '-u', 'R2_PGBACKREST_PREFIX'];
  if (explicitPrefixTuple) {
    launcherArgs.push('R2_RESTORE_OBJECT_PREFIX=pgbackrest', 'R2_PGBACKREST_PREFIX=pgbackrest');
  }
  launcherArgs.push('REQUIRE_LIVE_R2_RO=1', '/bin/bash', script, ...args);
  const result = spawnSync('/usr/bin/env', launcherArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: childEnv,
    timeout: 600_000,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? '',
    prefixVariablesInitiallyUnset: initialPrefixVariablesUnset,
    explicitPrefixTuple,
    placeholderEscapeInjected:
      'ALLOW_PLACEHOLDER_R2_RO' in childEnv ||
      launcherArgs.some((arg) => arg.startsWith('ALLOW_PLACEHOLDER_R2_RO=')),
  };
}

function summarizeResult(result: CommandResult, secretValues: string[]) {
  return {
    status: result.status,
    error: redact(result.error, secretValues),
    stdout: redact(result.stdout, secretValues).slice(0, 2400),
    stderr: redact(result.stderr, secretValues).slice(0, 2400),
  };
}

function combined(result: CommandResult, secretValues: string[]): string {
  return redact(`${result.stdout}\n${result.stderr}\n${result.error}`, secretValues);
}

function dockerBin(): string | null {
  for (const candidate of [
    '/usr/bin/docker',
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

type BunTrustCheck = {
  path: string | null;
  reason: string;
};

function inspectTrustedBunCandidate(
  candidate: string,
  lstat: (path: string) => ReturnType<typeof lstatSync> = lstatSync
): BunTrustCheck {
  if (!candidate.startsWith('/')) return { path: null, reason: 'path is not absolute' };
  try {
    const parts = candidate.split('/').filter(Boolean);
    let current = '/';
    const root = lstat(current);
    if (root.isSymbolicLink())
      return { path: null, reason: 'root trust-chain component is a symlink' };
    if (root.uid !== 0)
      return { path: null, reason: 'root trust-chain component is not root-owned' };
    if ((root.mode & 0o022) !== 0)
      return { path: null, reason: 'root trust-chain component is group/world-writable' };

    for (const [index, part] of parts.entries()) {
      current = current === '/' ? `/${part}` : `${current}/${part}`;
      const stat = lstat(current);
      if (stat.isSymbolicLink())
        return { path: null, reason: `trust-chain component is a symlink: ${current}` };
      if (stat.uid !== 0)
        return { path: null, reason: `trust-chain component is not root-owned: ${current}` };
      if ((stat.mode & 0o022) !== 0)
        return { path: null, reason: `trust-chain component is group/world-writable: ${current}` };
      if (index < parts.length - 1) {
        if (!stat.isDirectory())
          return { path: null, reason: `trust-chain component is not a directory: ${current}` };
        if ((stat.mode & 0o111) === 0)
          return { path: null, reason: `trust-chain directory is not searchable: ${current}` };
      } else {
        if (!stat.isFile()) return { path: null, reason: 'executable is not a regular file' };
        if ((stat.mode & 0o111) === 0)
          return { path: null, reason: 'executable is not executable' };
      }
    }
    return { path: candidate, reason: 'trusted' };
  } catch {
    return { path: null, reason: 'trust-chain stat failed' };
  }
}

function validateTrustedBunCandidate(
  candidate: string,
  lstat: (path: string) => ReturnType<typeof lstatSync> = lstatSync
): string | null {
  return inspectTrustedBunCandidate(candidate, lstat).path;
}

function bunBin(): string | null {
  return validateTrustedBunCandidate(TRUSTED_BUN_PATH);
}

function dockerContextHost(): string | null {
  const docker = dockerBin();
  if (!docker) return null;
  const context = spawnSync(docker, ['context', 'show'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  const name = context.status === 0 ? context.stdout.trim() : '';
  if (!name) return null;
  const inspected = spawnSync(
    docker,
    ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}', name],
    { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 }
  );
  const host = inspected.status === 0 ? inspected.stdout.trim() : '';
  return host || null;
}

type PitrWindow = {
  ok: boolean;
  earliest?: string;
  latest?: string;
  recommended_pitr?: string;
  window_max?: string;
  error?: string;
};

type ProbeSpawn = (
  command: string,
  args: string[],
  options: Parameters<typeof spawnSync>[2]
) => ReturnType<typeof spawnSync>;

/**
 * Candidate seam used only by the filesystem-backed trust rejection test below.
 * The live path calls queryPitrWindow(), which supplies the fixed path and has
 * no environment or caller override.
 */
function queryPitrWindowAtCandidate(
  config: SecretConfig,
  candidate: string,
  lstat: (path: string) => ReturnType<typeof lstatSync> = lstatSync,
  spawn: ProbeSpawn = spawnSync
): PitrWindow {
  const trust = inspectTrustedBunCandidate(candidate, lstat);
  if (!trust.path) {
    return {
      ok: false,
      error: `${BUN_DEPENDENCY_FAILURE}: ${trust.reason} at ${candidate}`,
    };
  }
  const env = envForConfig(config, resolve(EVIDENCE_DIR, 'window-probe'));
  const result = spawn(trust.path, [HOLO_CLI, 'restore:window', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env,
    timeout: 120_000,
  });
  try {
    const report = JSON.parse(result.stdout ?? '') as PitrWindow;
    return result.status === 0 ? report : { ...report, ok: false };
  } catch {
    return {
      ok: false,
      error: `restore:window exited ${result.status ?? 'unknown'} without JSON`,
    };
  }
}

function queryPitrWindow(
  config: SecretConfig,
  lstat: (path: string) => ReturnType<typeof lstatSync> = lstatSync,
  spawn: ProbeSpawn = spawnSync
): PitrWindow {
  return queryPitrWindowAtCandidate(config, TRUSTED_BUN_PATH, lstat, spawn);
}

type CleanupResult = {
  dockerAvailable: boolean;
  commands: Array<{ args: string[]; status: number | null; error: string }>;
  stagingRemoved: boolean;
};

type NamespaceObservation = {
  dockerAvailable: boolean;
  dockerRuntimeStatus: number | null;
  containerStatus: number | null;
  pgdataVolumeStatus: number | null;
  blobsVolumeStatus: number | null;
  networkStatus: number | null;
  stagingExists: boolean;
  restoreArtifactsExist: boolean;
  attestationExists: boolean;
  reportExists: boolean;
};

function observeNamespace(
  host: string,
  stagingRoot: string,
  attestation: string,
  report: string
): NamespaceObservation {
  const docker = dockerBin();
  const inspect = (args: string[]): number | null => {
    if (!docker) return null;
    return spawnSync(docker, args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 30_000 }).status;
  };
  return {
    dockerAvailable: Boolean(docker),
    dockerRuntimeStatus: inspect(['info']),
    containerStatus: inspect(['container', 'inspect', host]),
    pgdataVolumeStatus: inspect(['volume', 'inspect', `${host}-pgdata`]),
    blobsVolumeStatus: inspect(['volume', 'inspect', `${host}-blobs`]),
    networkStatus: inspect(['network', 'inspect', `${host}-net`]),
    stagingExists: existsSync(stagingRoot),
    restoreArtifactsExist: [
      resolve(stagingRoot, host, 'restore-target.env'),
      resolve(stagingRoot, host, 'docker-compose.yml'),
      resolve(stagingRoot, host, 'paths.txt'),
    ].some((path) => existsSync(path)),
    attestationExists: existsSync(attestation),
    reportExists: existsSync(report),
  };
}

function cleanupNamespace(host: string, stagingRoot: string): CleanupResult {
  const docker = dockerBin();
  const commands: CleanupResult['commands'] = [];
  if (docker) {
    for (const args of [
      ['rm', '-f', host],
      ['volume', 'rm', '-f', `${host}-pgdata`, `${host}-blobs`],
      ['network', 'rm', `${host}-net`],
    ]) {
      const result = spawnSync(docker, args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        timeout: 30_000,
      });
      commands.push({ args, status: result.status, error: result.error?.message ?? '' });
    }
  }
  rmSync(stagingRoot, { recursive: true, force: true });
  return { dockerAvailable: Boolean(docker), commands, stagingRemoved: !existsSync(stagingRoot) };
}

function containsSecret(path: string, secretValues: string[]): boolean {
  if (!existsSync(path)) return false;
  const text = readFileSync(path, 'utf8');
  return secretValues.some((value) => Boolean(value) && text.includes(value));
}

const secretConfig = discoverSecretConfig();
const gate = credentialGate(secretConfig);
const configuredSecrets = Object.values(secretConfig?.values ?? {});
const requestedTargetTimestamp =
  process.env.HOLO_QA31_TARGET_TIMESTAMP ?? process.env.PITR_TIMESTAMP ?? '';
const pitrWindow = gate.available && secretConfig ? queryPitrWindow(secretConfig) : null;
const targetTimestamp = requestedTargetTimestamp || pitrWindow?.recommended_pitr || '';
const pitrTimestampInWindow = (() => {
  if (!targetTimestamp || !pitrWindow?.ok || !pitrWindow.earliest || !pitrWindow.latest)
    return false;
  const timestamp = Date.parse(targetTimestamp);
  return timestamp >= Date.parse(pitrWindow.earliest) && timestamp <= Date.parse(pitrWindow.latest);
})();
const credentialSecrets = secretConfig
  ? [
      secretConfig.values.R2_ACCESS_KEY_ID,
      secretConfig.values.R2_SECRET_ACCESS_KEY,
      secretConfig.values.R2_SESSION_TOKEN,
      secretConfig.values.R2_RESTORE_ACCESS_KEY_ID,
      secretConfig.values.R2_RESTORE_SECRET_ACCESS_KEY,
      secretConfig.values.R2_RESTORE_SESSION_TOKEN,
      secretConfig.values.R2_REPO_CIPHER_PASS,
      secretConfig.values.RESTIC_PASSWORD,
    ].filter((value): value is string => Boolean(value))
  : [];

const positiveRunnable = gate.available && pitrTimestampInWindow;

function writePositiveDependencyEvidence(noKeyControlExecuted = false): string | null {
  if (positiveRunnable) return null;
  const dependencyFailure = gate.available
    ? (pitrWindow?.error ??
      'live credentials are available; restore:window must provide an in-window PITR timestamp before the real disposable consumer gate runs')
    : gate.reason;
  return writeEvidence(
    'positive-dependency.json',
    {
      schema: 'holo.gate-fix-s28r3-qa32.positive-dependency.v1',
      status: 'blocked',
      task: 'GATE-FIX-S28R3-QA32',
      reason: dependencyFailure,
      credential_gate: gate,
      pitr_window: pitrWindow,
      requested_target_timestamp: Boolean(requestedTargetTimestamp),
      target_timestamp_present: Boolean(targetTimestamp),
      positive_control_executed: false,
      no_key_control_executed: noKeyControlExecuted,
      provider_or_docker_invoked: false,
    },
    configuredSecrets
  );
}

describe('GATE-FIX-S28R3-QA32 trusted PITR probe and ambient-free real restore consumers', () => {
  it('real scripts exist and parse without changing their gate contracts', () => {
    const source = readFileSync(import.meta.filename, 'utf8');
    expect(source).not.toContain(['/Users', 'inference1', '/'].join(''));
    expect(source).not.toContain(['.bun', 'bin', 'bun'].join('/'));
    expect(source).not.toMatch(new RegExp(['/opt', 'homebrew', 'bin', 'bun'].join('[/\\/]')));
    expect(source).not.toContain(['process.env', 'BUN_BIN'].join('.'));
    expect(existsSync(PROVISION)).toBe(true);
    expect(existsSync(FIRE_DRILL)).toBe(true);
    for (const script of [PROVISION, FIRE_DRILL]) {
      const syntax = spawnSync('/bin/bash', ['-n', script], { encoding: 'utf8' });
      expect(syntax.status, `bash -n failed for ${basename(script)}`).toBe(0);
    }
    const plan = JSON.parse(readFileSync(resolve(SPRINT_DIR, 'gate-plan.json'), 'utf8')) as {
      steps?: Array<{ n: number; literal_cmd?: string }>;
    };
    const step3 = plan.steps?.find((step) => step.n === 3);
    expect(step3?.literal_cmd).toContain('R2_RESTORE_OBJECT_PREFIX="pgbackrest"');
    expect(step3?.literal_cmd).toContain('R2_PGBACKREST_PREFIX="pgbackrest"');
    expect(step3?.literal_cmd).not.toContain('ALLOW_PLACEHOLDER_R2_RO=1');
    expect(
      readFileSync(
        resolve(
          REPO_ROOT,
          'services/platform/tests/integration/sprint28-s28r3-qa30-gate-fix.test.ts'
        ),
        'utf8'
      )
    ).toContain('canonicalPolicyFromHelper');
    const bun = bunBin();
    expect(
      bun,
      `${BUN_DEPENDENCY_FAILURE}: fixed ${TRUSTED_BUN_PATH} is missing or untrusted`
    ).not.toBeNull();
    const qa30 = spawnSync(bun as string, ['x', 'vitest', 'run', QA30_TEST], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 120_000,
    });
    expect(`${qa30.stdout ?? ''}\n${qa30.stderr ?? ''}`).toContain('Test Files');
    expect(qa30.status).toBe(0);
  });

  it('routes a credentialed PITR-window probe only through the fixed trusted Bun path', () => {
    expect(TRUSTED_BUN_PATH).toBe('/usr/local/bin/bun');
    let observedCommand = '';
    let observedArgs: string[] = [];
    let observedEnv: NodeJS.ProcessEnv | undefined;
    const probe = queryPitrWindow(
      {
        path: '/tmp/qa32-trust-boundary-secrets.yaml',
        values: {
          R2_RESTORE_ACCESS_KEY_ID: 'qa32-access-sentinel',
          R2_RESTORE_SECRET_ACCESS_KEY: 'qa32-secret-sentinel',
        },
      },
      lstatSync,
      (command, args, options) => {
        observedCommand = command;
        observedArgs = args;
        observedEnv = options?.env as NodeJS.ProcessEnv | undefined;
        return {
          status: 0,
          stdout:
            '{"ok":true,"earliest":"2026-01-01T00:00:00Z","latest":"2026-01-02T00:00:00Z","recommended_pitr":"2026-01-01T12:00:00Z"}',
          stderr: '',
        } as ReturnType<typeof spawnSync>;
      }
    );
    expect(observedCommand).toBe(TRUSTED_BUN_PATH);
    expect(observedArgs).toEqual([HOLO_CLI, 'restore:window', '--json']);
    expect(observedEnv?.R2_RESTORE_SECRET_ACCESS_KEY).toBe('qa32-secret-sentinel');
    expect(probe.ok).toBe(true);

    if (!positiveRunnable) {
      const evidencePath = writePositiveDependencyEvidence();
      expect(evidencePath).not.toBeNull();
      const evidenceText = readFileSync(evidencePath as string, 'utf8');
      const evidence = JSON.parse(evidenceText) as {
        status: string;
        task: string;
        positive_control_executed: boolean;
        provider_or_docker_invoked: boolean;
      };
      expect(evidence.status).toBe('blocked');
      expect(evidence.task).toBe('GATE-FIX-S28R3-QA32');
      expect(evidence.positive_control_executed).toBe(false);
      expect(evidence.provider_or_docker_invoked).toBe(false);
      for (const secret of configuredSecrets) expect(evidenceText).not.toContain(secret);
      return;
    }

    expect(pitrWindow).not.toBeNull();
  });

  it('rejects symlink, user-owned, and writable Bun substitutes before credential env or child launch', () => {
    const root = mkdtempSync(join(tmpdir(), 'holo-qa32-bun-trust-'));
    const secretPath = resolve(root, 'credentials.yaml');
    const observer = resolve(root, 'observer-bun');
    const observationPath = `${secretPath}.observed`;
    const observerSource = [
      '#!/bin/sh',
      String.raw`printf 'restore_secret=%s\n' "\${R2_RESTORE_SECRET_ACCESS_KEY:-unset}" > "\${HOLO_SECRETS_PATH}.observed"`,
      'printf \'%s\\n\' \'{"ok":true,"earliest":"2026-01-01T00:00:00Z","latest":"2026-01-02T00:00:00Z","recommended_pitr":"2026-01-01T12:00:00Z"}\'',
      '',
    ].join('\n');
    writeFileSync(secretPath, '# disposable trust-boundary fixture\n', { mode: 0o600 });
    writeFileSync(observer, observerSource, { mode: 0o755 });

    const userOwned = resolve(root, 'user-owned-bun');
    writeFileSync(userOwned, observerSource, { mode: 0o755 });
    if (process.getuid?.() === 0) chownSync(userOwned, 65534, 65534);
    const writable = resolve(root, 'writable-bun');
    writeFileSync(writable, observerSource, { mode: 0o755 });
    chmodSync(writable, 0o777);
    const symlink = resolve(root, 'symlink-bun');
    symlinkSync(observer, symlink);
    expect(lstatSync(symlink).isSymbolicLink()).toBe(true);
    expect(lstatSync(userOwned).uid).not.toBe(0);
    expect(lstatSync(writable).mode & 0o022).not.toBe(0);

    const config: SecretConfig = {
      path: secretPath,
      values: {
        R2_RESTORE_ACCESS_KEY_ID: 'qa32-access-sentinel',
        R2_RESTORE_SECRET_ACCESS_KEY: 'qa32-secret-sentinel',
      },
    };

    try {
      const expectedReasons = new Map([
        [symlink, 'trust-chain component is a symlink'],
        [userOwned, 'trust-chain component is not root-owned'],
        [writable, 'trust-chain component is group/world-writable'],
      ]);
      for (const candidate of [symlink, userOwned, writable]) {
        // /private/tmp is intentionally mode 1777, so the production validator
        // correctly rejects its ancestor chain. Use the real candidate lstat
        // while supplying a trusted directory stat only for fixture ancestors;
        // the fixed live path remains covered with the default full-chain check.
        const fixtureLstat = (path: string) => {
          if (path === candidate) {
            const stat = lstatSync(path);
            if (candidate === symlink) {
              Object.defineProperty(stat, 'uid', { value: 0 });
              Object.defineProperty(stat, 'mode', {
                value: (stat.mode & 0o170000) | 0o555,
              });
            }
            if (candidate === writable) Object.defineProperty(stat, 'uid', { value: 0 });
            return stat;
          }
          return !root.startsWith(`${path}/`) && path !== root
            ? lstatSync(path)
            : lstatSync('/usr/local/bin');
        };
        const probe = queryPitrWindowAtCandidate(config, candidate, fixtureLstat);
        expect(probe.ok, candidate).toBe(false);
        expect(probe.error, candidate).toContain(
          `${BUN_DEPENDENCY_FAILURE}: ${expectedReasons.get(candidate)}`
        );
        expect(existsSync(observationPath), candidate).toBe(false);
      }

      const untrustedParentLstat = (path: string) => {
        const stat = lstatSync(path);
        if (path === '/usr/local/bin') Object.defineProperty(stat, 'uid', { value: 501 });
        return stat;
      };
      const ancestorProbe = queryPitrWindowAtCandidate(
        config,
        TRUSTED_BUN_PATH,
        untrustedParentLstat
      );
      expect(ancestorProbe.ok).toBe(false);
      expect(ancestorProbe.error).toContain(
        `${BUN_DEPENDENCY_FAILURE}: trust-chain component is not root-owned: /usr/local/bin`
      );
      expect(existsSync(observationPath)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs provision and fire-drill with an explicit prefix tuple after ambient-free startup', () => {
    if (!positiveRunnable) {
      const evidencePath = writePositiveDependencyEvidence();
      expect(evidencePath).not.toBeNull();
      return;
    }
    if (!secretConfig) throw new Error('credential gate reported available without secret config');
    if (!pitrTimestampInWindow)
      throw new Error(
        'QA31 positive gate requires a restore:window-derived in-window PITR timestamp; do not silently skip live consumer execution'
      );
    const host = `s28r3-qa31-${Date.now().toString(36)}-${process.pid}`;
    const stagingRoot = resolve(EVIDENCE_DIR, 'positive-staging', host);
    const attestation = resolve(EVIDENCE_DIR, `attestation-${host}.json`);
    const report = resolve(EVIDENCE_DIR, `parity-report-${host}.json`);
    const envFile = resolve(stagingRoot, host, 'restore-target.env');
    const env = envForConfig(secretConfig, stagingRoot);
    let provision: ConsumerRun;
    let fireDrill: ConsumerRun;
    let boundRestoreEnv = false;
    let attestationBody: Record<string, unknown> = {};
    let reportBody: Record<string, unknown> = {};
    let beforeCleanup: NamespaceObservation;
    let afterConsumersBeforeCleanup: NamespaceObservation;
    let afterCleanup: NamespaceObservation;
    let cleanup: CleanupResult;

    try {
      beforeCleanup = observeNamespace(host, stagingRoot, attestation, report);
      provision = runRealConsumer(
        PROVISION,
        ['--host', host, '--skip-isolation', '--pg-port', String(56000 + (Date.now() % 3000))],
        env,
        true
      );
      if (existsSync(envFile)) {
        const generated = readFileSync(envFile, 'utf8');
        boundRestoreEnv =
          /R2_RESTORE_OBJECT_PREFIX=.?pgbackrest/.test(generated) &&
          /R2_PGBACKREST_PREFIX=.?pgbackrest/.test(generated);
      }

      fireDrill = runRealConsumer(
        FIRE_DRILL,
        [
          '--host',
          host,
          '--target-timestamp',
          targetTimestamp,
          '--attestation',
          attestation,
          '--report',
          report,
        ],
        env,
        true
      );
      if (existsSync(attestation)) {
        if (containsSecret(attestation, credentialSecrets))
          throw new Error('attestation contains a configured secret');
        try {
          attestationBody = JSON.parse(readFileSync(attestation, 'utf8')) as Record<
            string,
            unknown
          >;
        } catch {
          attestationBody = {};
        }
      }
      if (existsSync(report)) {
        if (containsSecret(report, credentialSecrets))
          throw new Error('parity report contains a configured secret');
        try {
          reportBody = JSON.parse(readFileSync(report, 'utf8')) as Record<string, unknown>;
        } catch {
          reportBody = {};
        }
      }
      afterConsumersBeforeCleanup = observeNamespace(host, stagingRoot, attestation, report);
    } finally {
      cleanup = cleanupNamespace(host, stagingRoot);
      afterCleanup = observeNamespace(host, stagingRoot, attestation, report);
    }

    const omissionHost = `s28r3-qa32-omission-${Date.now().toString(36)}-${process.pid}`;
    const omissionStaging = resolve(EVIDENCE_DIR, 'omission-staging', omissionHost);
    const omissionEnv = envForConfig(secretConfig, omissionStaging);
    const omissionAttestation = resolve(EVIDENCE_DIR, `omission-attestation-${omissionHost}.json`);
    const omissionReport = resolve(EVIDENCE_DIR, `omission-report-${omissionHost}.json`);
    const omissionBeforeCleanup = observeNamespace(
      omissionHost,
      omissionStaging,
      omissionAttestation,
      omissionReport
    );
    const omittedProvision = runRealConsumer(
      PROVISION,
      ['--host', omissionHost, '--skip-isolation'],
      omissionEnv,
      false
    );
    const omittedFireDrill = runRealConsumer(
      FIRE_DRILL,
      [
        '--host',
        omissionHost,
        '--target-timestamp',
        targetTimestamp,
        '--attestation',
        omissionAttestation,
        '--report',
        omissionReport,
      ],
      omissionEnv,
      false
    );
    const omissionAfterConsumersBeforeCleanup = observeNamespace(
      omissionHost,
      omissionStaging,
      omissionAttestation,
      omissionReport
    );
    const omittedProvisionOutput = combined(omittedProvision, configuredSecrets);
    const omittedFireDrillOutput = combined(omittedFireDrill, configuredSecrets);
    const prefixOmissionNegative = {
      provision: {
        status: omittedProvision.status,
        dependency_marker_observed: /DEPENDENCY-S28-R2-RO/.test(omittedProvisionOutput),
        prefix_variables_initially_unset: omittedProvision.prefixVariablesInitiallyUnset,
        explicit_prefix_tuple: omittedProvision.explicitPrefixTuple,
      },
      fire_drill: {
        status: omittedFireDrill.status,
        dependency_marker_observed: /DEPENDENCY-S28-R2-RO/.test(omittedFireDrillOutput),
        prefix_variables_initially_unset: omittedFireDrill.prefixVariablesInitiallyUnset,
        explicit_prefix_tuple: omittedFireDrill.explicitPrefixTuple,
      },
    };
    const omissionCleanup = cleanupNamespace(omissionHost, omissionStaging);
    const omissionAfterCleanup = observeNamespace(
      omissionHost,
      omissionStaging,
      omissionAttestation,
      omissionReport
    );

    const evidence = {
      schema: 'holo.gate-fix-s28r3-qa32.positive-live.v1',
      status: 'executed',
      task: 'GATE-FIX-S28R3-QA32',
      secret_config_basename: basename(secretConfig.path),
      prefix_start: {
        R2_RESTORE_OBJECT_PREFIX: 'unset',
        R2_PGBACKREST_PREFIX: 'unset',
      },
      explicit_prefix_tuple: 'R2_RESTORE_OBJECT_PREFIX=pgbackrest R2_PGBACKREST_PREFIX=pgbackrest',
      pitr_window: pitrWindow,
      requested_target_timestamp: Boolean(requestedTargetTimestamp),
      target_timestamp: targetTimestamp,
      provision: {
        ...summarizeResult(provision, configuredSecrets),
        prefix_variables_initially_unset: provision.prefixVariablesInitiallyUnset,
        explicit_prefix_tuple: provision.explicitPrefixTuple,
        bound_restore_env: boundRestoreEnv,
      },
      fire_drill: {
        ...summarizeResult(fireDrill, configuredSecrets),
        prefix_variables_initially_unset: fireDrill.prefixVariablesInitiallyUnset,
        explicit_prefix_tuple: fireDrill.explicitPrefixTuple,
        attestation_ok: attestationBody.ok === true,
        report_postgres_parity_pass: reportBody.POSTGRES_PARITY_PASS === true,
      },
      prefix_omission_negative: {
        ...prefixOmissionNegative,
        before_cleanup: omissionBeforeCleanup,
        after_consumers_before_cleanup: omissionAfterConsumersBeforeCleanup,
        after_cleanup: omissionAfterCleanup,
        cleanup: omissionCleanup,
      },
      cleanup: {
        docker_namespace: `${host}, ${host}-pgdata, ${host}-blobs, ${host}-net`,
        before_cleanup: beforeCleanup,
        after_consumers_before_cleanup: afterConsumersBeforeCleanup,
        after_cleanup: afterCleanup,
        ...cleanup,
      },
    };
    writeEvidence('positive-live.json', evidence, configuredSecrets);

    const evidenceText = readFileSync(resolve(EVIDENCE_DIR, 'positive-live.json'), 'utf8');
    expect(evidenceText).not.toMatch(
      /R2_(?:RESTORE_)?(?:ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)\s*[=:]\s*[^\s[]+/i
    );
    expect(provision.status, summarizeResult(provision, configuredSecrets)).toBe(0);
    expect(provision.prefixVariablesInitiallyUnset).toBe(true);
    expect(provision.explicitPrefixTuple).toBe(true);
    expect(boundRestoreEnv).toBe(true);
    expect(fireDrill.status, summarizeResult(fireDrill, configuredSecrets)).toBe(0);
    expect(fireDrill.prefixVariablesInitiallyUnset).toBe(true);
    expect(fireDrill.explicitPrefixTuple).toBe(true);
    expect(attestationBody.ok).toBe(true);
    expect(reportBody.POSTGRES_PARITY_PASS).toBe(true);
    expect(cleanup.stagingRemoved).toBe(true);
    expect(beforeCleanup.dockerRuntimeStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.dockerRuntimeStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.containerStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.pgdataVolumeStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.blobsVolumeStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.networkStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.restoreArtifactsExist).toBe(true);
    expect(afterConsumersBeforeCleanup.attestationExists).toBe(true);
    expect(afterConsumersBeforeCleanup.reportExists).toBe(true);
    expect(afterCleanup.containerStatus).not.toBe(0);
    expect(afterCleanup.pgdataVolumeStatus).not.toBe(0);
    expect(afterCleanup.blobsVolumeStatus).not.toBe(0);
    expect(afterCleanup.networkStatus).not.toBe(0);
    expect(omittedProvision.status).not.toBe(0);
    expect(omittedFireDrill.status).not.toBe(0);
    expect(omittedProvisionOutput).toMatch(/DEPENDENCY-S28-R2-RO/);
    expect(omittedFireDrillOutput).toMatch(/DEPENDENCY-S28-R2-RO/);
    expect(omittedProvision.prefixVariablesInitiallyUnset).toBe(true);
    expect(omittedFireDrill.prefixVariablesInitiallyUnset).toBe(true);
    expect(omittedProvision.explicitPrefixTuple).toBe(false);
    expect(omittedFireDrill.explicitPrefixTuple).toBe(false);
    expect(omissionAfterConsumersBeforeCleanup.restoreArtifactsExist).toBe(false);
    expect(omissionAfterConsumersBeforeCleanup.attestationExists).toBe(false);
    expect(omissionAfterConsumersBeforeCleanup.reportExists).toBe(false);
    expect(omissionAfterConsumersBeforeCleanup.containerStatus).not.toBe(0);
    expect(omissionAfterConsumersBeforeCleanup.pgdataVolumeStatus).not.toBe(0);
    expect(omissionAfterConsumersBeforeCleanup.blobsVolumeStatus).not.toBe(0);
    expect(omissionAfterConsumersBeforeCleanup.networkStatus).not.toBe(0);
    expect(omissionCleanup.stagingRemoved).toBe(true);
    for (const command of cleanup.commands) {
      expect(command.status === 0 || command.status === 1).toBe(true);
      expect(command.error).toBe('');
    }
  }, 1_200_000);

  it('real no-key provision and fire-drill paths fail closed without prefix ambient state or artifacts', () => {
    const root = mkdtempSync(join(tmpdir(), 'holo-qa31-no-key-'));
    const emptySecrets = resolve(root, 'empty-secrets.yaml');
    writeFileSync(emptySecrets, '# deliberately empty disposable secret configuration\n', {
      mode: 0o600,
    });
    const host = `s28r3-qa31-no-key-${Date.now().toString(36)}-${process.pid}`;
    const stagingRoot = resolve(root, 'staging');
    const attestation = resolve(root, 'attestation.json');
    const report = resolve(root, 'parity-report.json');
    const env = ambientFreeEnv();
    env.HOLO_SECRETS_PATH = emptySecrets;
    env.HOLOCRON_SECRETS_PATH = emptySecrets;
    env.STAGING_ROOT = stagingRoot;
    env.MINI_HOST = '203.0.113.1';
    env.HOLO_FIRE_DRILL_LOCKDIR = resolve(stagingRoot, 'fire-drill.lockdir');

    let provision: ConsumerRun;
    let fireDrill: ConsumerRun;
    let beforeCleanup: NamespaceObservation;
    let afterConsumersBeforeCleanup: NamespaceObservation;
    let cleanup: CleanupResult;
    try {
      beforeCleanup = observeNamespace(host, stagingRoot, attestation, report);
      provision = runRealConsumer(PROVISION, ['--host', host, '--skip-isolation'], env, true);
      fireDrill = runRealConsumer(
        FIRE_DRILL,
        [
          '--host',
          host,
          '--target-timestamp',
          '2000-01-01T00:00:00Z',
          '--attestation',
          attestation,
          '--report',
          report,
        ],
        env,
        true
      );
      afterConsumersBeforeCleanup = observeNamespace(host, stagingRoot, attestation, report);
    } finally {
      cleanup = cleanupNamespace(host, stagingRoot);
    }

    const secretValues: string[] = [];
    const provisionOutput = combined(provision, secretValues);
    const fireDrillOutput = combined(fireDrill, secretValues);
    const noSuccessfulRestoreArtifact =
      !afterConsumersBeforeCleanup.attestationExists &&
      !afterConsumersBeforeCleanup.reportExists &&
      !afterConsumersBeforeCleanup.restoreArtifactsExist &&
      afterConsumersBeforeCleanup.dockerRuntimeStatus === 0 &&
      afterConsumersBeforeCleanup.containerStatus !== 0 &&
      afterConsumersBeforeCleanup.pgdataVolumeStatus !== 0 &&
      afterConsumersBeforeCleanup.blobsVolumeStatus !== 0 &&
      afterConsumersBeforeCleanup.networkStatus !== 0;
    const evidence = {
      schema: 'holo.gate-fix-s28r3-qa32.no-key-negative.v1',
      status: 'executed',
      task: 'GATE-FIX-S28R3-QA32',
      secret_config: 'empty disposable file; no credentials',
      prefix_start: {
        R2_RESTORE_OBJECT_PREFIX: 'unset',
        R2_PGBACKREST_PREFIX: 'unset',
      },
      provision: {
        ...summarizeResult(provision, secretValues),
        prefix_variables_initially_unset: provision.prefixVariablesInitiallyUnset,
        explicit_prefix_tuple: provision.explicitPrefixTuple,
        placeholder_escape_injected: provision.placeholderEscapeInjected,
        dependency_marker_observed: /DEPENDENCY-S28-R2-RO/.test(provisionOutput),
      },
      fire_drill: {
        ...summarizeResult(fireDrill, secretValues),
        prefix_variables_initially_unset: fireDrill.prefixVariablesInitiallyUnset,
        explicit_prefix_tuple: fireDrill.explicitPrefixTuple,
        placeholder_escape_injected: fireDrill.placeholderEscapeInjected,
        dependency_marker_observed: /DEPENDENCY-S28-R2-RO/.test(fireDrillOutput),
      },
      no_successful_restore_artifact: noSuccessfulRestoreArtifact,
      docker_observation: {
        before_cleanup: beforeCleanup,
        after_consumers_before_cleanup: afterConsumersBeforeCleanup,
        resource_created_before_cleanup:
          afterConsumersBeforeCleanup.containerStatus === 0 ||
          afterConsumersBeforeCleanup.pgdataVolumeStatus === 0 ||
          afterConsumersBeforeCleanup.blobsVolumeStatus === 0 ||
          afterConsumersBeforeCleanup.networkStatus === 0,
      },
      cleanup,
    };
    const evidencePath = writeEvidence('no-key-negative.json', evidence);
    writePositiveDependencyEvidence(true);
    rmSync(root, { recursive: true, force: true });

    expect(evidencePath).toContain('GATE-FIX-S28R3-QA32');
    expect(provision.status).not.toBe(0);
    expect(fireDrill.status).not.toBe(0);
    expect(provisionOutput).toMatch(/DEPENDENCY-S28-R2-RO/);
    expect(fireDrillOutput).toMatch(/DEPENDENCY-S28-R2-RO/);
    expect(provision.prefixVariablesInitiallyUnset).toBe(true);
    expect(fireDrill.prefixVariablesInitiallyUnset).toBe(true);
    expect(provision.explicitPrefixTuple).toBe(true);
    expect(fireDrill.explicitPrefixTuple).toBe(true);
    expect(provision.placeholderEscapeInjected).toBe(false);
    expect(fireDrill.placeholderEscapeInjected).toBe(false);
    expect(provisionOutput).not.toMatch(/SUCCESS: fresh restore target/);
    expect(fireDrillOutput).not.toMatch(/POSTGRES_PARITY_PASS\s*[:=]\s*true/);
    expect(noSuccessfulRestoreArtifact).toBe(true);
    expect(beforeCleanup.dockerRuntimeStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.dockerRuntimeStatus).toBe(0);
    expect(afterConsumersBeforeCleanup.containerStatus).not.toBe(0);
    expect(afterConsumersBeforeCleanup.pgdataVolumeStatus).not.toBe(0);
    expect(afterConsumersBeforeCleanup.blobsVolumeStatus).not.toBe(0);
    expect(afterConsumersBeforeCleanup.networkStatus).not.toBe(0);
    expect(cleanup.stagingRemoved).toBe(true);
    for (const command of cleanup.commands) {
      expect(command.status === 0 || command.status === 1).toBe(true);
      expect(command.error).toBe('');
    }
  });

  it('binds every durable QA33 record to generated time, review, and execution head', () => {
    for (const name of ['positive-dependency.json', 'no-key-negative.json']) {
      const path = resolve(EVIDENCE_DIR, name);
      expect(existsSync(path), name).toBe(true);
      const evidence = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
      expect(evidence.schema, name).toMatch(/^holo\.gate-fix-s28r3-qa33\./);
      expect(evidence.task, name).toBe('GATE-FIX-S28R3-QA33');
      expect(evidence.generated_at, name).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(evidence.reviewed_sha, name).toMatch(/^[0-9a-f]{40}$/);
      expect(evidence.execution_head, name).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});
