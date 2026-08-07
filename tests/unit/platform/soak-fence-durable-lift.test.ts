/**
 * GATE-FIX-fence-lift — durable HOLO_MIGRATION_READ_ONLY=0 disarms sticky process.env.
 *
 * Unit lane (no Postgres / PLATFORM_IT). Disposable secrets only.
 *
 * Run:
 *   pnpm vitest run --project unit tests/unit/platform/soak-fence-durable-lift.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isMigrationReadOnly,
  readDurableMigrationReadOnly,
  setMigrationReadOnlyEnv,
  writeDurableMigrationReadOnly,
} from '../../../services/platform/src/cutover/soak-fence.ts';

const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const EVIDENCE = resolve(REPO_ROOT, '.tmp/GATE-FIX-fence-lift');
const DISPOSABLE_SECRETS = resolve(EVIDENCE, 'unit-disposable-secrets.yaml');

const prevSecrets = process.env.HOLO_SECRETS_PATH;
const prevHolocronSecrets = process.env.HOLOCRON_SECRETS_PATH;
const prevFence = process.env.HOLO_MIGRATION_READ_ONLY;

function bindDisposableSecrets(initial: '0' | '1' = '0'): void {
  mkdirSync(EVIDENCE, { recursive: true });
  writeFileSync(DISPOSABLE_SECRETS, `HOLO_MIGRATION_READ_ONLY: "${initial}"\n`, 'utf8');
  process.env.HOLO_SECRETS_PATH = DISPOSABLE_SECRETS;
  process.env.HOLOCRON_SECRETS_PATH = DISPOSABLE_SECRETS;
}

describe('GATE-FIX-fence-lift isMigrationReadOnly durable lift', () => {
  beforeEach(() => {
    bindDisposableSecrets('0');
    setMigrationReadOnlyEnv('0');
  });

  afterEach(() => {
    if (prevSecrets === undefined) delete process.env.HOLO_SECRETS_PATH;
    else process.env.HOLO_SECRETS_PATH = prevSecrets;
    if (prevHolocronSecrets === undefined) delete process.env.HOLOCRON_SECRETS_PATH;
    else process.env.HOLOCRON_SECRETS_PATH = prevHolocronSecrets;
    if (prevFence === undefined) delete process.env.HOLO_MIGRATION_READ_ONLY;
    else process.env.HOLO_MIGRATION_READ_ONLY = prevFence;
  });

  it('AC-1: sticky env=1 + durable=0 → isMigrationReadOnly() === false', () => {
    // Simulate long-lived serving process that booted with fence armed (sticky env).
    writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
    // writeDurable also overlays process.env to '0'; re-stick like boot-time load.
    setMigrationReadOnlyEnv('1');
    expect(process.env.HOLO_MIGRATION_READ_ONLY).toBe('1');
    expect(readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS)).toBe('0');

    const armed = isMigrationReadOnly();
    writeFileSync(
      resolve(EVIDENCE, 'unit-ac1-sticky-env-durable-lift.json'),
      `${JSON.stringify(
        {
          sticky_env: process.env.HOLO_MIGRATION_READ_ONLY,
          durable: readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS),
          isMigrationReadOnly: armed,
          expected: false,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    expect(armed).toBe(false);
  });

  it('AC-1b: sticky env=1 + durable=false string also disarms', () => {
    mkdirSync(EVIDENCE, { recursive: true });
    writeFileSync(DISPOSABLE_SECRETS, 'HOLO_MIGRATION_READ_ONLY: "false"\n', 'utf8');
    setMigrationReadOnlyEnv('1');
    expect(isMigrationReadOnly()).toBe(false);
  });

  it('AC-2 R2-C01: env=0 + durable=1 → isMigrationReadOnly() === true', () => {
    writeDurableMigrationReadOnly('1', { secretsPath: DISPOSABLE_SECRETS });
    setMigrationReadOnlyEnv('0');
    expect(process.env.HOLO_MIGRATION_READ_ONLY).toBe('0');
    expect(readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS)).toBe('1');

    const armed = isMigrationReadOnly();
    writeFileSync(
      resolve(EVIDENCE, 'unit-ac2-r2-c01-durable-arm.json'),
      `${JSON.stringify(
        {
          env: process.env.HOLO_MIGRATION_READ_ONLY,
          durable: readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS),
          isMigrationReadOnly: armed,
          expected: true,
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    expect(armed).toBe(true);
  });

  it('AC-3 unit: enable-writes path — durable lift disarms sticky env for write gate', () => {
    // Serving process booted with fence=1; CLI enable-writes writes durable 0 only.
    setMigrationReadOnlyEnv('1');
    writeFileSync(DISPOSABLE_SECRETS, 'HOLO_MIGRATION_READ_ONLY: "1"\n', 'utf8');
    expect(isMigrationReadOnly()).toBe(true);

    // CLI path: write durable 0 WITHOUT updating the serving process.env (simulate by re-stick).
    writeDurableMigrationReadOnly('0', { secretsPath: DISPOSABLE_SECRETS });
    setMigrationReadOnlyEnv('1'); // serving process still sticky

    const afterLift = isMigrationReadOnly();
    writeFileSync(
      resolve(EVIDENCE, 'unit-ac3-enable-writes-sticky-disarm.json'),
      `${JSON.stringify(
        {
          scenario: 'serving sticky env=1 after durable enable-writes wrote 0',
          sticky_env: process.env.HOLO_MIGRATION_READ_ONLY,
          durable: readDurableMigrationReadOnly(process.env, DISPOSABLE_SECRETS),
          isMigrationReadOnly: afterLift,
          expected: false,
          note: 'Hono middleware / assertWritable call isMigrationReadOnly() each request',
        },
        null,
        2
      )}\n`,
      'utf8'
    );
    expect(afterLift).toBe(false);
  });
});
