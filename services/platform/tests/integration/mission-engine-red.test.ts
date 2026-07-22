/**
 * Sprint 15 / mission-5 — RED integration suite for the Mission Engine.
 *
 * Real boundaries only:
 * - PLATFORM_IT=1 required
 * - holocron_nonprod only
 * - real Bun CLI subprocesses
 * - real Postgres assertions
 * - real Hono auth surface (app.request), no mocked middleware
 *
 * Run:
 *   PLATFORM_IT=1 \
 *   DATABASE_URL=postgres://127.0.0.1:5432/holocron_nonprod \
 *   HOLO_KEY_RN=rn-test HOLO_KEY_MCP=mcp-test HOLO_KEY_CONTROL=ctl-test \
 *   pnpm vitest run services/platform/tests/integration/mission-engine-red.test.ts
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHonoApp } from '../../src/http/hono-app';
import {
  HOLO_TEST_CHECKPOINT_BARRIER_ENV,
  MISSION_CHECKPOINT_BARRIER_MARKER,
} from '../../src/mission/checkpoint-barrier';
import {
  CONTROL,
  callAppJson,
  committedStageDuplicates,
  DATABASE_URL,
  detectProvenanceSnapshot,
  EXPECTED_COMMIT_COLUMNS,
  EXPECTED_MISSION_TABLES,
  EXPECTED_RUN_COLUMNS,
  EXPECTED_STAGE_RUN_COLUMNS,
  EXPECTED_TEMPLATE_VERSION_COLUMNS,
  ensureRedTestEnvironment,
  MCP,
  makeCreateBody,
  missingColumns,
  normalizeForDeterministicCompare,
  PLATFORM_IT,
  prepareManifestFixture,
  prepareTemplateFixture,
  RN,
  rowValue,
  runHolo,
  runMissionRuntime,
  runMissionRuntimeResume,
  runMissionRuntimeStatus,
  sameComparableValue,
  scanMissionCrashHooks,
  scenarioId,
  selectInferenceTelemetry,
  selectMissionCommits,
  selectMissionEvents,
  selectMissionRunById,
  selectMissionRunsByIdempotencyKey,
  selectMissionRunsByTemplateKey,
  selectMissionStageRuns,
  selectMissionSteering,
  selectMissionTemplatesByKey,
  selectMissionTemplateVersions,
  selectMissionVerdicts,
  snapshotMissionSchema,
  startHoloProcess,
  startMissionRuntimeProcess,
  terminalEventCount,
  truncateMissionTables,
  waitForValue,
  withSql,
  writeArtifact,
} from './mission-red.helpers';

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

function stringValue(
  record: JsonRecord | null | undefined,
  aliases: readonly string[]
): string | null {
  const value = rowValue(record, aliases);
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function numberValue(
  record: JsonRecord | null | undefined,
  aliases: readonly string[]
): number | null {
  const value = rowValue(record, aliases);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function runIdFromUnknown(value: unknown): string | null {
  return stringValue(asRecord(value), ['runId', 'run_id', 'id']);
}

function terminalStatus(value: JsonRecord | null | undefined): string | null {
  return stringValue(value, ['status']);
}

function usageSnapshot(record: JsonRecord | null | undefined): JsonRecord {
  if (!record) return {};
  const usage = rowValue(record, ['usage', 'usage_json', 'usageJson']);
  if (usage && typeof usage === 'object') return asRecord(usage);
  const snapshot: JsonRecord = {};
  for (const [key, value] of Object.entries(record)) {
    if (/(token|wall|cost|step|usage)/i.test(key)) snapshot[key] = value;
  }
  return snapshot;
}

function typedOutputSnapshot(record: JsonRecord | null | undefined): unknown {
  if (!record) return null;
  return (
    rowValue(record, ['typed_output_json', 'typedOutputJson']) ??
    rowValue(record, ['output']) ??
    rowValue(record, ['result']) ??
    null
  );
}

function roleResolutionForStage(
  record: JsonRecord | null | undefined,
  stageKey: string
): JsonRecord | null {
  if (!record) return null;
  const provenance = asRecord(rowValue(record, ['provenance']));
  const roleResolution =
    rowValue(record, ['role_resolution_json', 'roleResolutionJson']) ??
    rowValue(provenance, ['roleResolution', 'role_resolution']);
  const stageResolution = asRecord(roleResolution)[stageKey];
  return stageResolution && typeof stageResolution === 'object' ? asRecord(stageResolution) : null;
}

function canonicalizeForByteCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForByteCompare(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as JsonRecord)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalizeForByteCompare(child)])
    );
  }
  return value;
}

function canonicalJsonBytes(value: unknown): string | null {
  if (value === undefined) return null;
  return JSON.stringify(canonicalizeForByteCompare(value));
}

function missionVersionDefinition(record: JsonRecord | null | undefined): unknown {
  return rowValue(record, [
    'definition_json',
    'definitionJson',
    'definition',
    'template_definition',
    'templateDefinition',
    'template_json',
    'templateJson',
    'dsl_json',
    'dslJson',
  ]);
}

function missionVersionSurface(record: JsonRecord | null | undefined) {
  return {
    dslVersion: stringValue(record, ['dsl_version', 'dslVersion']),
    definitionHash: stringValue(record, ['definition_hash', 'definitionHash']),
    compilerVersion: stringValue(record, ['compiler_version', 'compilerVersion']),
    registrySnapshotHash: stringValue(record, ['registry_snapshot_hash', 'registrySnapshotHash']),
    provenanceBytes: canonicalJsonBytes(detectProvenanceSnapshot(record)),
    definitionBytes: canonicalJsonBytes(missionVersionDefinition(record)),
  };
}

function normalizedSignatures(rows: JsonRecord[]): string[] {
  return rows.map((row) => JSON.stringify(normalizeForDeterministicCompare(row)));
}

function assertNoExecutablePayload(record: JsonRecord | null | undefined, label: string) {
  const serialized = JSON.stringify(record ?? {}).toLowerCase();
  expect
    .soft(serialized, `${label} must not persist executable payloads`)
    .not.toMatch(/function\s*\(|=>|raw sql|inline zod|javascript|executable payload/);
}

async function findRunByIdempotencyKey(idempotencyKey: string): Promise<JsonRecord | null> {
  return withSql(
    async (sql) => (await selectMissionRunsByIdempotencyKey(sql, idempotencyKey))[0] ?? null
  );
}

async function summarizeRun(runId: string | null) {
  return withSql(async (sql) => ({
    run: runId ? await selectMissionRunById(sql, runId) : null,
    stageRuns: runId ? await selectMissionStageRuns(sql, runId) : [],
    commits: runId ? await selectMissionCommits(sql, runId) : [],
    events: runId ? await selectMissionEvents(sql, runId) : [],
    telemetry: runId ? await selectInferenceTelemetry(sql, runId) : [],
    steering: runId ? await selectMissionSteering(sql, runId) : [],
    verdicts: runId ? await selectMissionVerdicts(sql, runId) : [],
  }));
}

type RunSummary = Awaited<ReturnType<typeof summarizeRun>>;

function runMutationSurface(summary: RunSummary) {
  const terminalCommit = summary.commits[summary.commits.length - 1] ?? null;
  const outputSource = typedOutputSnapshot(summary.run) != null ? summary.run : terminalCommit;
  return {
    runBytes: canonicalJsonBytes(summary.run),
    commitBytes: canonicalJsonBytes(summary.commits),
    eventBytes: canonicalJsonBytes(summary.events),
    outputBytes: canonicalJsonBytes(typedOutputSnapshot(outputSource)),
  };
}

function normalizeEndpointForCompare(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\/$/, '').replace(/\/v1$/i, '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeCrashBoundaryMarker(marker: string | null | undefined): string | null {
  if (!marker) return null;
  return marker.replace(/^mission-commit\//, '');
}

function readBoundaryMarkerFromText(text: string, boundary: string): string | null {
  const fullMarker = `mission-commit/${boundary}`;
  const patterns = [
    new RegExp(`HOLO_TEST_CRASH_AT[^\\n]{0,160}${escapeRegExp(fullMarker)}`, 'i'),
    new RegExp(
      `(trigger(?:ed)?|marker|readiness|hook)[^\\n]{0,160}${escapeRegExp(fullMarker)}`,
      'i'
    ),
    new RegExp(
      `${escapeRegExp(fullMarker)}[^\\n]{0,160}(trigger(?:ed)?|marker|readiness|hook)`,
      'i'
    ),
    new RegExp(`(trigger(?:ed)?|marker|readiness|hook)[^\\n]{0,160}${escapeRegExp(boundary)}`, 'i'),
  ];
  if (!patterns.some((pattern) => pattern.test(text))) return null;
  return text.includes(fullMarker) ? fullMarker : boundary;
}

function readBoundaryMarkerFromValue(
  value: unknown,
  boundary: string,
  keyHint = ''
): string | null {
  const fullMarker = `mission-commit/${boundary}`;

  if (typeof value === 'string') {
    if (/(crash|boundary|hook|marker|readiness|ready)/i.test(keyHint)) {
      if (value === boundary || value === fullMarker) return value;
      if (value.includes(fullMarker)) return fullMarker;
    }
    if (
      keyHint.length === 0 ||
      /(message|detail|error|stdout|stderr|artifact|readiness|note|debug|log)/i.test(keyHint)
    ) {
      return readBoundaryMarkerFromText(value, boundary);
    }
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const marker = readBoundaryMarkerFromValue(item, boundary, keyHint);
      if (marker) return marker;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as JsonRecord)) {
      const marker = readBoundaryMarkerFromValue(child, boundary, key);
      if (marker) return marker;
    }
  }

  return null;
}

type CrashBoundaryProof = {
  source: string;
  marker: string;
  runId: string | null;
};

type CheckpointBarrierProof = {
  marker: string;
  runId: string | null;
  stageIndex: number | null;
  checkpointKey: string | null;
  leaseToken: string | null;
  leaseOwner: string | null;
  payload: JsonRecord;
};

function readCheckpointBarrierProof(value: unknown): CheckpointBarrierProof | null {
  const payload = asRecord(value);
  if (
    payload.checkpointBarrier !== true ||
    payload.readiness !== true ||
    payload.testOnly !== true
  ) {
    return null;
  }

  const marker = stringValue(payload, ['marker']);
  if (marker !== MISSION_CHECKPOINT_BARRIER_MARKER) {
    return null;
  }

  return {
    marker,
    runId: runIdFromUnknown(payload),
    stageIndex: numberValue(payload, ['stageIndex', 'stage_index']),
    checkpointKey: stringValue(payload, ['checkpointKey', 'checkpoint_key']),
    leaseToken: stringValue(payload, ['leaseToken', 'lease_token']),
    leaseOwner: stringValue(payload, ['leaseOwner', 'lease_owner']),
    payload,
  };
}

async function detectCrashBoundaryProof(
  boundary: string,
  key: string,
  snapshot?: { stdout: string; stderr: string; parsed: unknown }
): Promise<CrashBoundaryProof | null> {
  if (snapshot) {
    const parsedMarker = readBoundaryMarkerFromValue(snapshot.parsed, boundary);
    if (parsedMarker) {
      return { source: 'parsed', marker: parsedMarker, runId: runIdFromUnknown(snapshot.parsed) };
    }

    const stdoutMarker = readBoundaryMarkerFromText(snapshot.stdout, boundary);
    if (stdoutMarker) {
      return { source: 'stdout', marker: stdoutMarker, runId: runIdFromUnknown(snapshot.parsed) };
    }

    const stderrMarker = readBoundaryMarkerFromText(snapshot.stderr, boundary);
    if (stderrMarker) {
      return { source: 'stderr', marker: stderrMarker, runId: runIdFromUnknown(snapshot.parsed) };
    }
  }

  const runRow = await findRunByIdempotencyKey(key);
  const runId = stringValue(runRow, ['id']);
  if (!runId) return null;

  const summary = await summarizeRun(runId);
  const dbMarker = readBoundaryMarkerFromValue(
    {
      run: summary.run,
      stageRuns: summary.stageRuns,
      commits: summary.commits,
      events: summary.events,
      telemetry: summary.telemetry,
    },
    boundary
  );
  if (!dbMarker) return null;
  return { source: 'db', marker: dbMarker, runId };
}

function committedStageIndexes(stageRuns: JsonRecord[]): number[] {
  return stageRuns
    .filter((row) => String(rowValue(row, ['status']) ?? '') === 'committed')
    .map((row) => numberValue(row, ['stage_index', 'stageIndex']))
    .filter((value): value is number => value != null)
    .sort((a, b) => a - b);
}

function firstCheckpointStage(stageRuns: JsonRecord[]): JsonRecord | null {
  return (
    stageRuns.find(
      (row) =>
        String(rowValue(row, ['status']) ?? '') === 'committed' &&
        stringValue(row, ['checkpoint_key', 'checkpointKey'])
    ) ?? null
  );
}

const invalidDslCases = [
  {
    name: 'unknown-stage',
    fixture: 'template-invalid-unknown-stage.json',
    regex: /unknown|unregistered|stage/i,
  },
  {
    name: 'unknown-schema',
    fixture: 'template-invalid-unknown-schema.json',
    regex: /unknown|unregistered|schema/i,
  },
  {
    name: 'executable-payload',
    fixture: 'template-invalid-executable-payload.json',
    regex: /inline|zod|raw sql|executable|javascript|js/i,
  },
] as const;

const fleetNegativeCases = [
  {
    name: 'missing-role-manifest',
    manifest: 'manifest-missing-divergent.json',
    regex: /manifest|divergent|missing|invalid/i,
  },
  {
    name: 'dead-role-endpoint',
    manifest: 'manifest-dead-divergent.json',
    regex: /unreachable|refused|health|down|ECONNREFUSED|timeout/i,
  },
  {
    name: 'cloud-fallback-refused',
    manifest: 'manifest-cloud-divergent.json',
    regex: /cloud|anthropic|refused|never-cloud|non-fleet/i,
  },
] as const;

const commitCrashBoundaries = [
  'before_commit_insert',
  'after_commit_insert_before_run_update',
  'after_run_update_before_terminal_event',
] as const;

describe.sequential('Sprint 15 mission-5 RED suite — mission engine missing surfaces', () => {
  beforeAll(async () => {
    await ensureRedTestEnvironment();
    expect(PLATFORM_IT).toBe(true);
    expect(DATABASE_URL).toContain('/holocron_nonprod');
  }, 120_000);

  beforeEach(async () => {
    await truncateMissionTables();
  }, 30_000);

  it('AC-1/TC-1 RED: template register requires mission migrations + immutable version/provenance rows scoped to the scenario template', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac1-template-register');
    const cli = runHolo('ac1-template-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);

    await withSql(async (sql) => {
      const schema = await snapshotMissionSchema(sql);
      const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      const versionRow = versionRows[0] ?? null;
      const missingTables = EXPECTED_MISSION_TABLES.filter(
        (table) => !schema.tables[table]?.exists
      );
      const missingVersionColumns = missingColumns(
        schema.tables.mission_template_versions?.columns ?? [],
        EXPECTED_TEMPLATE_VERSION_COLUMNS
      );
      const checkpointConstraintRows = await sql<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1
            FROM pg_constraint c
            JOIN pg_class t ON t.oid = c.conrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            WHERE n.nspname = 'public'
              AND t.relname = 'mission_runs'
              AND c.conname = 'mission_runs_checkpoint_stage_index_nonneg'
          ) AS exists
        `;
      const hasCheckpointStageConstraint = Boolean(checkpointConstraintRows[0]?.exists);
      const payload = asRecord(cli.parsed);

      writeArtifact('ac1-template-register-summary.json', {
        template,
        cli,
        schema,
        templateRows,
        versionRows,
        missingTables,
        missingVersionColumns,
        hasCheckpointStageConstraint,
      });

      expect.soft(schema.database).toBe('holocron_nonprod');
      expect.soft(missingTables, `missing mission tables: ${missingTables.join(', ')}`).toEqual([]);
      expect.soft(cli.status, cli.combined).toBe(0);
      expect.soft(payload.ok, JSON.stringify(payload)).toBe(true);
      expect.soft(payload.templateKey).toBe(template.templateKey);
      expect.soft(payload.version).toBe(template.version);
      expect.soft(payload.dslVersion).toBe('mission_template_v1');
      expect.soft(payload.definitionHash).toBeTruthy();
      expect.soft(payload.compilerVersion).toBeTruthy();
      expect.soft(payload.registrySnapshotHash).toBeTruthy();
      expect.soft(payload.outputSchemaRef).toBe('mission.test.echo.output');
      expect
        .soft(missingVersionColumns, 'mission_template_versions missing pinned provenance columns')
        .toEqual([]);
      expect.soft(templateRows.length, 'one scoped mission_templates row must exist').toBe(1);
      expect
        .soft(versionRows.length, 'one scoped immutable mission_template_versions row must exist')
        .toBe(1);
      expect
        .soft(stringValue(versionRow, ['template_key', 'templateKey']))
        .toBe(template.templateKey);
      expect.soft(stringValue(versionRow, ['version'])).toBe(template.version);
      expect
        .soft(stringValue(versionRow, ['dsl_version', 'dslVersion']))
        .toBe('mission_template_v1');
      expect
        .soft(stringValue(versionRow, ['definition_hash', 'definitionHash']))
        .toBe(String(payload.definitionHash ?? ''));
      expect
        .soft(stringValue(versionRow, ['compiler_version', 'compilerVersion']))
        .toBe(String(payload.compilerVersion ?? ''));
      expect
        .soft(stringValue(versionRow, ['registry_snapshot_hash', 'registrySnapshotHash']))
        .toBe(String(payload.registrySnapshotHash ?? ''));
      expect
        .soft(stringValue(versionRow, ['output_schema_ref', 'outputSchemaRef']))
        .toBe('mission.test.echo.output');
      expect
        .soft(numberValue(versionRow, ['output_schema_version', 'outputSchemaVersion']))
        .toBe(1);
      expect
        .soft(
          hasCheckpointStageConstraint,
          'mission_runs must enforce non-negative checkpoint_stage_index'
        )
        .toBe(true);
      expect
        .soft(detectProvenanceSnapshot(versionRow), 'version row must persist provenance surface')
        .toBeTruthy();
      assertNoExecutablePayload(versionRow, 'mission_template_versions row');
    });
  }, 60_000);

  it('AC-1/TC-2 RED: duplicate same template version is idempotent while conflicting content for the same key/version is rejected', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac1-duplicate-register');
    const identical = prepareTemplateFixture(
      'template-test.echo.json',
      'ac1-duplicate-register-identical',
      {
        templateKey: template.templateKey,
        version: template.version,
      }
    );
    const conflicting = prepareTemplateFixture(
      'template-test.echo.json',
      'ac1-duplicate-register-conflict',
      {
        templateKey: template.templateKey,
        version: template.version,
        mutate: (body) => {
          body.description = `${String(body.description ?? '')} (conflict)`;
        },
      }
    );

    const first = runHolo('ac1-duplicate-first', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const firstState = await withSql(async (sql) => {
      const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      return {
        templateRows,
        versionRows,
        versionRow: versionRows[0] ?? null,
      };
    });
    const second = runHolo('ac1-duplicate-second', [
      'mission',
      'template:register',
      identical.path,
      '--json',
    ]);
    const secondState = await withSql(async (sql) => {
      const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      return {
        templateRows,
        versionRows,
        versionRow: versionRows[0] ?? null,
      };
    });
    const conflict = runHolo('ac1-duplicate-conflict', [
      'mission',
      'template:register',
      conflicting.path,
      '--json',
    ]);

    await withSql(async (sql) => {
      const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      const survivingVersionRow = versionRows[0] ?? null;
      const firstPayload = asRecord(first.parsed);
      const secondPayload = asRecord(second.parsed);
      const firstVersionSurface = missionVersionSurface(firstState.versionRow);
      const survivingVersionSurface = missionVersionSurface(survivingVersionRow);

      writeArtifact('ac1-duplicate-summary.json', {
        template,
        identical,
        conflicting,
        first,
        firstState,
        second,
        secondState,
        conflict,
        templateRows,
        versionRows,
        survivingVersionRow,
        firstVersionSurface,
        survivingVersionSurface,
      });

      expect.soft(first.status, first.combined).toBe(0);
      expect
        .soft(
          firstState.templateRows.length,
          'first successful register must persist one scoped template row'
        )
        .toBe(1);
      expect
        .soft(
          firstState.versionRows.length,
          'first successful register must persist one authoritative version row'
        )
        .toBe(1);
      expect.soft(second.status, second.combined).toBe(0);
      expect.soft(firstPayload.definitionHash, JSON.stringify(firstPayload)).toBeTruthy();
      expect
        .soft(secondPayload.definitionHash, JSON.stringify(secondPayload))
        .toBe(firstPayload.definitionHash);
      expect
        .soft(
          secondState.versionRows.length,
          'duplicate same hash must remain one scoped version row'
        )
        .toBe(1);
      expect
        .soft(versionRows.length, 'duplicate same key/version must remain one scoped immutable row')
        .toBe(1);
      expect
        .soft(templateRows.length, 'duplicate same key/version must remain one scoped template row')
        .toBe(1);
      expect.soft(conflict.status, conflict.combined).not.toBe(0);
      expect
        .soft(conflict.combined, conflict.combined)
        .toMatch(/conflict|hash|different|immutable/i);
      expect
        .soft(versionRows.length, 'conflicting definition must not create an extra version row')
        .toBe(1);
      expect
        .soft(
          survivingVersionSurface.definitionHash,
          'surviving row must keep the first successful definition_hash after conflicting register fails'
        )
        .toBe(String(firstPayload.definitionHash ?? ''));
      expect
        .soft(
          survivingVersionSurface.compilerVersion,
          'conflicting register must not overwrite compiler provenance on the authoritative row'
        )
        .toBe(firstVersionSurface.compilerVersion);
      expect
        .soft(
          survivingVersionSurface.registrySnapshotHash,
          'conflicting register must not overwrite registry provenance on the authoritative row'
        )
        .toBe(firstVersionSurface.registrySnapshotHash);
      expect
        .soft(
          survivingVersionSurface.provenanceBytes,
          'conflicting register must leave authoritative provenance bytes unchanged'
        )
        .toBe(firstVersionSurface.provenanceBytes);
      expect
        .soft(
          survivingVersionSurface.definitionBytes,
          'conflicting register must leave authoritative definition JSON bytes unchanged'
        )
        .toBe(firstVersionSurface.definitionBytes);
    });
  }, 60_000);

  it('AC-1/TC-2 RED: concurrent same template version registration is transactionally idempotent and returns one created=true plus one created=false', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac1-concurrent-register');
    const manifest = prepareManifestFixture(
      'manifest-dead-divergent.json',
      'ac1-concurrent-register-live',
      (body) => {
        const roles = asRecord(body.roles);
        const divergent = asRecord(roles.divergent);
        divergent.endpoint = 'http://127.0.0.1:4545';
        roles.divergent = divergent;
        body.roles = roles;
        body.schemaVersion = '1.0.0';
      }
    );

    const firstRunner = startHoloProcess(
      'ac1-concurrent-register-first',
      ['mission', 'template:register', template.path, '--json'],
      { env: { FLEET_MANIFEST_PATH: manifest.path } }
    );
    const secondRunner = startHoloProcess(
      'ac1-concurrent-register-second',
      ['mission', 'template:register', template.path, '--json'],
      { env: { FLEET_MANIFEST_PATH: manifest.path } }
    );
    const [first, second] = await Promise.all([firstRunner.result, secondRunner.result]);

    await withSql(async (sql) => {
      const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      const payloads = [asRecord(first.parsed), asRecord(second.parsed)];
      const createdFlags = payloads
        .map((payload) => Boolean(payload.created))
        .sort((left, right) => Number(left) - Number(right));

      writeArtifact('ac1-concurrent-register-summary.json', {
        template,
        manifest,
        first,
        second,
        templateRows,
        versionRows,
        payloads,
        createdFlags,
      });

      expect.soft(first.status, first.combined).toBe(0);
      expect.soft(second.status, second.combined).toBe(0);
      expect
        .soft(
          payloads.map((payload) => payload.ok),
          'both concurrent callers must succeed'
        )
        .toEqual([true, true]);
      expect
        .soft(payloads.map((payload) => payload.templateKey))
        .toEqual([template.templateKey, template.templateKey]);
      expect
        .soft(payloads.map((payload) => payload.dslVersion))
        .toEqual(['mission_template_v1', 'mission_template_v1']);
      expect
        .soft(`${first.combined}\n${second.combined}`)
        .not.toMatch(/duplicate key value violates unique constraint/i);
      expect
        .soft(templateRows.length, 'concurrent register must still leave one scoped template row')
        .toBe(1);
      expect
        .soft(
          versionRows.length,
          'concurrent register must still leave one scoped immutable version row'
        )
        .toBe(1);
      expect
        .soft(createdFlags, 'parallel duplicate register must return one create and one replay')
        .toEqual([false, true]);
      expect
        .soft(new Set(payloads.map((payload) => String(payload.definitionHash ?? ''))).size)
        .toBe(1);
    });
  }, 60_000);

  it('AC-1/TC-3 RED: same key/version with drifted compiled provenance is rejected and leaves the authoritative row byte-identical', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac1-provenance-drift');
    const originalManifest = prepareManifestFixture(
      'manifest-dead-divergent.json',
      'ac1-provenance-drift-original',
      (body) => {
        const roles = asRecord(body.roles);
        const divergent = asRecord(roles.divergent);
        divergent.endpoint = 'http://127.0.0.1:4545';
        divergent.modelRevision = 'pinned-divergent-r1';
        roles.divergent = divergent;
        body.roles = roles;
        body.schemaVersion = '1.0.0';
      }
    );
    const driftedManifest = prepareManifestFixture(
      'manifest-dead-divergent.json',
      'ac1-provenance-drift-mutated',
      (body) => {
        const roles = asRecord(body.roles);
        const divergent = asRecord(roles.divergent);
        divergent.endpoint = 'http://127.0.0.1:4545';
        divergent.modelRevision = 'mutated-divergent-r2';
        divergent.litellmModelId = 'implementer-mutated';
        roles.divergent = divergent;
        body.roles = roles;
        body.schemaVersion = '9.9.9';
      }
    );

    const first = runHolo(
      'ac1-provenance-drift-first',
      ['mission', 'template:register', template.path, '--json'],
      { env: { FLEET_MANIFEST_PATH: originalManifest.path } }
    );
    const beforeState = await withSql(async (sql) => {
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      return {
        versionRows,
        versionRow: versionRows[0] ?? null,
      };
    });
    const drift = runHolo(
      'ac1-provenance-drift-second',
      ['mission', 'template:register', template.path, '--json'],
      { env: { FLEET_MANIFEST_PATH: driftedManifest.path } }
    );
    const afterState = await withSql(async (sql) => {
      const versionRows = await selectMissionTemplateVersions(
        sql,
        template.templateKey,
        template.version
      );
      return {
        versionRows,
        versionRow: versionRows[0] ?? null,
      };
    });
    const firstPayload = asRecord(first.parsed);
    const driftPayload = asRecord(drift.parsed);

    writeArtifact('ac1-provenance-drift-summary.json', {
      template,
      originalManifest,
      driftedManifest,
      first,
      beforeState,
      drift,
      afterState,
      firstPayload,
      driftPayload,
    });

    expect.soft(first.status, first.combined).toBe(0);
    expect
      .soft(
        beforeState.versionRows.length,
        'initial register must create one authoritative version row'
      )
      .toBe(1);
    expect.soft(drift.status, drift.combined).not.toBe(0);
    expect.soft(driftPayload.ok, JSON.stringify(driftPayload)).toBe(false);
    expect
      .soft(drift.combined, drift.combined)
      .toMatch(/immutable|drift|fleet_manifest|model_revisions|role_resolution/i);
    expect
      .soft(
        afterState.versionRows.length,
        'drifted re-register must not create or replace the authoritative row'
      )
      .toBe(1);
    expect
      .soft(
        canonicalJsonBytes(afterState.versionRow),
        'drifted re-register must leave the authoritative row byte-identical'
      )
      .toBe(canonicalJsonBytes(beforeState.versionRow));
    expect
      .soft(
        stringValue(afterState.versionRow, ['fleet_manifest_version', 'fleetManifestVersion']),
        'authoritative row must keep the first successful fleet manifest version'
      )
      .toBe(String(firstPayload.fleetManifestVersion ?? ''));
    expect
      .soft(
        stringValue(afterState.versionRow, ['fleet_manifest_version', 'fleetManifestVersion']),
        'authoritative row must not adopt the drifted fleet manifest version'
      )
      .not.toBe('9.9.9');
  }, 60_000);

  for (const testCase of invalidDslCases) {
    it(`AC-2/TC-2 RED: ${testCase.name} fails before any scoped template/version/run row is created`, async () => {
      const template = prepareTemplateFixture(testCase.fixture, `ac2-invalid-${testCase.name}`);
      const cli = runHolo(`ac2-invalid-${testCase.name}`, [
        'mission',
        'template:register',
        template.path,
        '--json',
      ]);

      await withSql(async (sql) => {
        const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
        const versionRows = await selectMissionTemplateVersions(
          sql,
          template.templateKey,
          template.version
        );
        const runRows = await selectMissionRunsByTemplateKey(sql, template.templateKey);
        writeArtifact(`ac2-invalid-${testCase.name}-summary.json`, {
          template,
          cli,
          templateRows,
          versionRows,
          runRows,
        });

        expect.soft(cli.status, cli.combined).not.toBe(0);
        expect
          .soft(
            cli.combined,
            'missing command is not sufficient proof of compiler rejection — require the mission compiler surface'
          )
          .not.toMatch(/unknown command:\s+mission\s+/i);
        expect.soft(cli.combined, cli.combined).toMatch(testCase.regex);
        expect
          .soft(templateRows.length, 'compiler rejection must not persist mission_templates')
          .toBe(0);
        expect
          .soft(versionRows.length, 'compiler rejection must not persist mission_template_versions')
          .toBe(0);
        expect
          .soft(runRows.length, 'compiler rejection must not create a mission_runs row')
          .toBe(0);
      });
    }, 60_000);
  }

  for (const testCase of fleetNegativeCases) {
    it(`AC-2/TC-2 RED: ${testCase.name} fails closed before any scoped template/version/run row`, async () => {
      const template = prepareTemplateFixture(
        'template-test.echo.json',
        `ac2-fleet-${testCase.name}`
      );
      const cli = runHolo(
        `ac2-fleet-${testCase.name}`,
        ['mission', 'template:register', template.path, '--json'],
        {
          env: {
            FLEET_MANIFEST_PATH: prepareManifestFixture(
              testCase.manifest,
              `ac2-fleet-${testCase.name}`
            ).path,
          },
        }
      );

      await withSql(async (sql) => {
        const templateRows = await selectMissionTemplatesByKey(sql, template.templateKey);
        const versionRows = await selectMissionTemplateVersions(
          sql,
          template.templateKey,
          template.version
        );
        const runRows = await selectMissionRunsByTemplateKey(sql, template.templateKey);
        writeArtifact(`ac2-fleet-${testCase.name}-summary.json`, {
          template,
          cli,
          templateRows,
          versionRows,
          runRows,
        });

        expect.soft(cli.status, cli.combined).not.toBe(0);
        expect
          .soft(
            cli.combined,
            'missing command is not sufficient proof of fleet fail-closed validation — require the mission compiler surface'
          )
          .not.toMatch(/unknown command:\s+mission\s+/i);
        expect.soft(cli.combined, cli.combined).toMatch(testCase.regex);
        expect
          .soft(templateRows.length, 'fleet rejection must not persist mission_templates')
          .toBe(0);
        expect
          .soft(versionRows.length, 'fleet rejection must not persist mission_template_versions')
          .toBe(0);
        expect.soft(runRows.length, 'fleet rejection must not create a mission_runs row').toBe(0);
      });
    }, 60_000);
  }

  it('AC-1/AC-2/TC-2 RED: test.sigkill is SIGKILLed only after a DB-observed committed checkpoint and resume starts at the first uncommitted stage', async () => {
    const template = prepareTemplateFixture('template-test.sigkill.json', 'ac-runtime-sigkill');
    const register = runHolo('ac-runtime-sigkill-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const runKey = scenarioId('sigkill-recovery');
    const runner = startMissionRuntimeProcess(
      'ac-runtime-sigkill-run',
      {
        templateKey: template.templateKey,
        goal: 'Checkpoint once, then prove durable resume.',
        idempotencyKey: runKey,
      },
      {
        env: {
          [HOLO_TEST_CHECKPOINT_BARRIER_ENV]: '1',
        },
      }
    );

    const observedRun = await waitForValue(
      'sigkill-run-row',
      () => findRunByIdempotencyKey(runKey),
      { abortIf: () => runner.exited() }
    );
    const barrierProof = await waitForValue(
      'sigkill-checkpoint-barrier',
      async () => readCheckpointBarrierProof(runner.snapshot().parsed),
      { abortIf: () => runner.exited() }
    );
    const observedRunId = barrierProof?.runId ?? stringValue(observedRun, ['id']);
    const committedCheckpoint = await waitForValue(
      'sigkill-committed-checkpoint',
      async () => {
        if (!observedRunId) return null;
        return withSql(async (sql) =>
          firstCheckpointStage(await selectMissionStageRuns(sql, observedRunId))
        );
      },
      { abortIf: () => runner.exited() }
    );
    const liveRunBeforeKill = observedRunId
      ? await withSql((sql) => selectMissionRunById(sql, observedRunId))
      : null;
    const preKillStages = observedRunId
      ? await withSql((sql) => selectMissionStageRuns(sql, observedRunId))
      : [];
    const aliveAtBarrier = Boolean(barrierProof) && !runner.exited();

    if (barrierProof && committedCheckpoint && !runner.exited()) {
      runner.kill('SIGKILL');
    }
    const runProc = await runner.result;
    const runId = observedRunId ?? runIdFromUnknown(runProc.parsed);

    await withSql(async (sql) => {
      if (
        runId &&
        schemaHasColumns(await snapshotMissionSchema(sql), 'mission_runs', ['lease_expires_at'])
      ) {
        await sql.unsafe(
          "UPDATE mission_runs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
          [runId]
        );
      }
    });

    const staleStatus = runMissionRuntimeStatus(
      'ac-runtime-sigkill-status-stale',
      runId ?? 'missing-run-id'
    );
    const resume = runMissionRuntimeResume('ac-runtime-sigkill-resume', runId ?? 'missing-run-id');

    await withSql(async (sql) => {
      const schema = await snapshotMissionSchema(sql);
      const runRow = runId ? await selectMissionRunById(sql, runId) : null;
      const postResumeStages = runId ? await selectMissionStageRuns(sql, runId) : [];
      const duplicateCommittedStages = await committedStageDuplicates(sql, runId);
      const checkpointStageIndex = numberValue(committedCheckpoint, ['stage_index', 'stageIndex']);
      const barrierStageIndex = barrierProof?.stageIndex ?? null;
      const barrierCheckpointKey = barrierProof?.checkpointKey ?? null;
      const barrierLeaseToken = barrierProof?.leaseToken ?? null;
      const committedBefore = committedStageIndexes(preKillStages);
      const committedAfter = committedStageIndexes(postResumeStages);
      const firstNewCommitted =
        committedAfter.find((stageIndex) => !committedBefore.includes(stageIndex)) ?? null;

      writeArtifact('ac-runtime-sigkill-summary.json', {
        template,
        register,
        runKey,
        observedRun,
        barrierProof,
        committedCheckpoint,
        liveRunBeforeKill,
        preKillStages,
        aliveAtBarrier,
        runProc,
        staleStatus,
        resume,
        schema,
        runRow,
        postResumeStages,
        duplicateCommittedStages,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(schema.tables.mission_runs?.exists, 'mission_runs table missing').toBe(true);
      expect
        .soft(schema.tables.mission_stage_runs?.exists, 'mission_stage_runs table missing')
        .toBe(true);
      expect
        .soft(
          missingColumns(schema.tables.mission_runs?.columns ?? [], EXPECTED_RUN_COLUMNS),
          'mission_runs missing lease/checkpoint columns'
        )
        .toEqual([]);
      expect
        .soft(
          missingColumns(
            schema.tables.mission_stage_runs?.columns ?? [],
            EXPECTED_STAGE_RUN_COLUMNS
          ),
          'mission_stage_runs missing checkpoint/fencing columns'
        )
        .toEqual([]);
      expect.soft(observedRunId, 'run row must exist before SIGKILL').toBeTruthy();
      expect
        .soft(barrierProof, 'must observe the explicit test-only checkpoint barrier before SIGKILL')
        .toBeTruthy();
      expect
        .soft(committedCheckpoint, 'must observe a committed DB checkpoint before SIGKILL')
        .toBeTruthy();
      expect
        .soft(
          aliveAtBarrier,
          'checkpoint barrier must keep the process alive until external SIGKILL'
        )
        .toBe(true);
      expect.soft(runProc.wasKilled, runProc.combined).toBe(true);
      expect
        .soft(checkpointStageIndex, 'checkpointed stage index must be visible before kill')
        .not.toBeNull();
      expect
        .soft(barrierStageIndex, 'checkpoint barrier must expose the committed stage index')
        .toBe(checkpointStageIndex);
      expect
        .soft(barrierCheckpointKey, 'checkpoint barrier must expose checkpointKey')
        .toBe(stringValue(committedCheckpoint, ['checkpoint_key', 'checkpointKey']));
      expect
        .soft(barrierLeaseToken, 'checkpoint barrier must expose the live lease token')
        .toBe(stringValue(liveRunBeforeKill, ['lease_token', 'leaseToken']));
      expect
        .soft(asRecord(staleStatus.parsed).status, 'expired killed run should surface as suspended')
        .toBe('suspended');
      expect.soft(resume.status, resume.combined).toBe(0);
      expect.soft(duplicateCommittedStages, 'resume must not duplicate committed stages').toBe(0);
      expect
        .soft(firstNewCommitted, 'resume must start from the first uncommitted stage')
        .toBe(checkpointStageIndex != null ? checkpointStageIndex + 1 : null);
      expect
        .soft(
          stringValue(liveRunBeforeKill, ['lease_owner', 'leaseOwner']),
          'checkpointed run must expose lease owner before SIGKILL'
        )
        .toBeTruthy();
      expect
        .soft(
          stringValue(liveRunBeforeKill, ['lease_token', 'leaseToken']),
          'checkpointed run must expose lease token before SIGKILL'
        )
        .toBeTruthy();
      expect
        .soft(
          stringValue(runRow, ['lease_owner', 'leaseOwner']),
          'terminal resume must clear lease_owner'
        )
        .toBeNull();
      expect
        .soft(
          stringValue(runRow, ['lease_token', 'leaseToken']),
          'terminal resume must clear lease_token'
        )
        .toBeNull();
    });
  }, 90_000);

  it('AC-2/TC-3 RED: two real resume contenders fence leases, expired recovery increments attempts, and terminal completion clears the lease', async () => {
    const template = prepareTemplateFixture('template-test.sigkill.json', 'ac-lease-contention');
    const register = runHolo('ac-lease-contention-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const runKey = scenarioId('lease-contention');
    const owner = startMissionRuntimeProcess(
      'ac-lease-contention-owner',
      {
        templateKey: template.templateKey,
        goal: 'Acquire a durable lease, checkpoint, then allow contender proof.',
        idempotencyKey: runKey,
      },
      {
        env: {
          [HOLO_TEST_CHECKPOINT_BARRIER_ENV]: '1',
        },
      }
    );

    const observedRun = await waitForValue(
      'lease-contention-run-row',
      () => findRunByIdempotencyKey(runKey),
      {
        abortIf: () => owner.exited(),
      }
    );
    const barrierProof = await waitForValue(
      'lease-contention-checkpoint-barrier',
      async () => readCheckpointBarrierProof(owner.snapshot().parsed),
      { abortIf: () => owner.exited() }
    );
    const runId = barrierProof?.runId ?? stringValue(observedRun, ['id']);
    const committedCheckpoint = await waitForValue(
      'lease-contention-checkpoint',
      async () => {
        if (!runId) return null;
        return withSql(async (sql) =>
          firstCheckpointStage(await selectMissionStageRuns(sql, runId))
        );
      },
      { abortIf: () => owner.exited() }
    );
    const liveLeaseBeforeKill = runId
      ? await withSql((sql) => selectMissionRunById(sql, runId))
      : null;
    const originalLeaseToken = stringValue(liveLeaseBeforeKill, ['lease_token', 'leaseToken']);
    const originalAttempt = numberValue(liveLeaseBeforeKill, ['attempt_count', 'attemptCount']);
    const activeStatus = runMissionRuntimeStatus(
      'ac-lease-contention-status-active',
      runId ?? 'missing-run-id'
    );
    const contenderResult = runMissionRuntimeResume(
      'ac-lease-contention-contender',
      runId ?? 'missing-run-id'
    );
    const afterContender = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const aliveAtBarrier = Boolean(barrierProof) && !owner.exited();

    if (barrierProof && committedCheckpoint && !owner.exited()) {
      owner.kill('SIGKILL');
    }
    const ownerResult = await owner.result;
    const afterOwnerKill = runId ? await summarizeRun(runId) : await summarizeRun(null);

    await withSql(async (sql) => {
      if (
        runId &&
        schemaHasColumns(await snapshotMissionSchema(sql), 'mission_runs', ['lease_expires_at'])
      ) {
        await sql.unsafe(
          "UPDATE mission_runs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
          [runId]
        );
      }
    });

    const staleStatus = runMissionRuntimeStatus(
      'ac-lease-contention-status-stale',
      runId ?? 'missing-run-id'
    );
    const recovery = runMissionRuntimeResume(
      'ac-lease-contention-recovery',
      runId ?? 'missing-run-id'
    );

    await withSql(async (sql) => {
      const schema = await snapshotMissionSchema(sql);
      const runRow = runId ? await selectMissionRunById(sql, runId) : null;
      const stageRuns = runId ? await selectMissionStageRuns(sql, runId) : [];
      const terminalLeaseToken = stringValue(runRow, ['lease_token', 'leaseToken']);
      const terminalLeaseOwner = stringValue(runRow, ['lease_owner', 'leaseOwner']);
      const terminalLeaseExpiry = stringValue(runRow, ['lease_expires_at', 'leaseExpiresAt']);
      const attemptCount = numberValue(runRow, ['attempt_count', 'attemptCount']);
      const fenceTokens = stageRuns
        .map((row) => stringValue(row, ['fence_token', 'fenceToken']))
        .filter((value): value is string => Boolean(value));

      writeArtifact('ac-lease-contention-summary.json', {
        template,
        register,
        runKey,
        observedRun,
        barrierProof,
        committedCheckpoint,
        liveLeaseBeforeKill,
        activeStatus,
        contenderResult,
        afterContender,
        aliveAtBarrier,
        ownerResult,
        afterOwnerKill,
        staleStatus,
        recovery,
        schema,
        runRow,
        stageRuns,
        fenceTokens,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(runId, 'a scoped run row must exist').toBeTruthy();
      expect
        .soft(
          barrierProof,
          'must observe the explicit test-only checkpoint barrier before contention'
        )
        .toBeTruthy();
      expect
        .soft(committedCheckpoint, 'must have a committed checkpoint before lease contention proof')
        .toBeTruthy();
      expect
        .soft(aliveAtBarrier, 'checkpoint barrier must keep the owner alive during contention')
        .toBe(true);
      expect
        .soft(asRecord(activeStatus.parsed).status, 'live leased run should report running status')
        .toBe('running');
      expect
        .soft(originalLeaseToken, 'owner lease token must be observable before contender')
        .toBeTruthy();
      expect.soft(contenderResult.status, contenderResult.combined).toBe(1);
      expect
        .soft(asRecord(contenderResult.parsed).errorCode, JSON.stringify(contenderResult.parsed))
        .toBe('MISSION_LEASE_HELD');
      expect
        .soft(
          stringValue(afterContender.run, ['lease_token', 'leaseToken']),
          'live contender must not steal the lease token'
        )
        .toBe(originalLeaseToken);
      expect
        .soft(
          numberValue(afterContender.run, ['attempt_count', 'attemptCount']),
          'live contender must not increment attempts'
        )
        .toBe(originalAttempt);
      expect.soft(ownerResult.wasKilled, ownerResult.combined).toBe(true);
      expect
        .soft(
          stringValue(afterOwnerKill.run, ['lease_token', 'leaseToken']),
          'killed owner should leave the terminal lease visible until recovery'
        )
        .toBe(originalLeaseToken);
      expect
        .soft(asRecord(staleStatus.parsed).status, 'expired stale run should surface as suspended')
        .toBe('suspended');
      expect.soft(recovery.status, recovery.combined).toBe(0);
      expect
        .soft(
          typeof attemptCount === 'number',
          'expired lease recovery must persist a numeric attempt_count'
        )
        .toBe(true);
      expect
        .soft(
          typeof attemptCount === 'number' && attemptCount > (originalAttempt ?? -1),
          'expired lease recovery must increment attempt_count'
        )
        .toBe(true);
      expect.soft(terminalLeaseOwner, 'terminal completion must clear lease_owner').toBeNull();
      expect.soft(terminalLeaseToken, 'terminal completion must clear lease_token').toBeNull();
      expect
        .soft(terminalLeaseExpiry, 'terminal completion must clear lease_expires_at')
        .toBeNull();
      expect
        .soft(
          new Set(fenceTokens).size,
          'stage runs must expose both original and recovery fence tokens'
        )
        .toBeGreaterThan(1);
      expect
        .soft(
          missingColumns(
            schema.tables.mission_stage_runs?.columns ?? [],
            EXPECTED_STAGE_RUN_COLUMNS
          ),
          'mission_stage_runs must expose fence_token'
        )
        .toEqual([]);
    });
  }, 90_000);

  it('AC-3/TC-4 RED: resume stays pinned to the original template/compiler/registry/executor/schema/fleet/model provenance after active definitions mutate', async () => {
    const template = prepareTemplateFixture('template-test.sigkill.json', 'ac-pinned-resume-base');
    const originalManifest = prepareManifestFixture(
      'manifest-dead-divergent.json',
      'ac-pinned-resume-original',
      (body) => {
        const roles = asRecord(body.roles);
        const divergent = asRecord(roles.divergent);
        divergent.endpoint = 'http://127.0.0.1:4545';
        divergent.modelRevision = 'pinned-divergent-r1';
        roles.divergent = divergent;
        body.roles = roles;
        body.schemaVersion = '1.0.0';
      }
    );
    const mutatedManifest = prepareManifestFixture(
      'manifest-dead-divergent.json',
      'ac-pinned-resume-mutated',
      (body) => {
        const roles = asRecord(body.roles);
        const divergent = asRecord(roles.divergent);
        divergent.endpoint = 'http://127.0.0.1:4545';
        divergent.modelRevision = 'mutated-divergent-r2';
        divergent.litellmModelId = 'implementer-mutated';
        roles.divergent = divergent;
        body.roles = roles;
        body.schemaVersion = '9.9.9';
      }
    );

    const register = runHolo(
      'ac-pinned-resume-register',
      ['mission', 'template:register', template.path, '--json'],
      { env: { FLEET_MANIFEST_PATH: originalManifest.path } }
    );
    const runKey = scenarioId('pinned-resume');
    const runner = startMissionRuntimeProcess(
      'ac-pinned-resume-run',
      {
        templateKey: template.templateKey,
        goal: 'Checkpoint under pinned provenance, then mutate active definitions.',
        idempotencyKey: runKey,
      },
      {
        env: {
          FLEET_MANIFEST_PATH: originalManifest.path,
          [HOLO_TEST_CHECKPOINT_BARRIER_ENV]: '1',
        },
      }
    );

    const observedRun = await waitForValue(
      'pinned-resume-run-row',
      () => findRunByIdempotencyKey(runKey),
      {
        abortIf: () => runner.exited(),
      }
    );
    const barrierProof = await waitForValue(
      'pinned-resume-checkpoint-barrier',
      async () => readCheckpointBarrierProof(runner.snapshot().parsed),
      { abortIf: () => runner.exited() }
    );
    const runId = barrierProof?.runId ?? stringValue(observedRun, ['id']);
    const committedCheckpoint = await waitForValue(
      'pinned-resume-checkpoint',
      async () => {
        if (!runId) return null;
        return withSql(async (sql) =>
          firstCheckpointStage(await selectMissionStageRuns(sql, runId))
        );
      },
      { abortIf: () => runner.exited() }
    );
    const originalRunBeforeKill = runId
      ? await withSql((sql) => selectMissionRunById(sql, runId))
      : null;
    const aliveAtBarrier = Boolean(barrierProof) && !runner.exited();

    if (committedCheckpoint && !runner.exited()) {
      runner.kill('SIGKILL');
    }
    const killed = await runner.result;

    const mutatedTemplate = prepareTemplateFixture(
      'template-test.sigkill.json',
      'ac-pinned-resume-mutated-template',
      {
        templateKey: template.templateKey,
        version: '9.9.9',
        mutate: (body) => {
          body.description = 'Mutated active template that must not affect resume';
          const budgets = asRecord(body.budgets);
          budgets.wallMs = 999999;
          body.budgets = budgets;
        },
      }
    );
    const mutatedRegister = runHolo(
      'ac-pinned-resume-register-mutated',
      ['mission', 'template:register', mutatedTemplate.path, '--json'],
      { env: { FLEET_MANIFEST_PATH: mutatedManifest.path } }
    );

    await withSql(async (sql) => {
      if (
        runId &&
        schemaHasColumns(await snapshotMissionSchema(sql), 'mission_runs', ['lease_expires_at'])
      ) {
        await sql.unsafe(
          "UPDATE mission_runs SET lease_expires_at = now() - interval '1 second' WHERE id = $1",
          [runId]
        );
      }
    });

    const staleStatus = runMissionRuntimeStatus(
      'ac-pinned-resume-status-stale',
      runId ?? 'missing-run-id',
      { env: { FLEET_MANIFEST_PATH: mutatedManifest.path } }
    );
    const resume = runMissionRuntimeResume('ac-pinned-resume-resume', runId ?? 'missing-run-id', {
      env: { FLEET_MANIFEST_PATH: mutatedManifest.path },
    });

    await withSql(async (sql) => {
      const runRow = runId ? await selectMissionRunById(sql, runId) : null;
      const commitRow = runId ? ((await selectMissionCommits(sql, runId))[0] ?? null) : null;
      const resumePayload = asRecord(resume.parsed);
      const originalProvenance = detectProvenanceSnapshot(originalRunBeforeKill);
      const resumedProvenance = detectProvenanceSnapshot(resumePayload);

      writeArtifact('ac-pinned-resume-summary.json', {
        template,
        originalManifest,
        mutatedManifest,
        register,
        observedRun,
        barrierProof,
        committedCheckpoint,
        originalRunBeforeKill,
        aliveAtBarrier,
        killed,
        mutatedTemplate,
        mutatedRegister,
        staleStatus,
        resume,
        resumePayload,
        runRow,
        commitRow,
        originalProvenance,
        resumedProvenance,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(runId, 'run must exist before pinned-resume mutation').toBeTruthy();
      expect
        .soft(
          barrierProof,
          'must observe the explicit test-only checkpoint barrier before mutation'
        )
        .toBeTruthy();
      expect
        .soft(committedCheckpoint, 'must observe a committed checkpoint before mutation')
        .toBeTruthy();
      expect
        .soft(aliveAtBarrier, 'checkpoint barrier must keep the pinned run alive until SIGKILL')
        .toBe(true);
      expect.soft(killed.wasKilled, killed.combined).toBe(true);
      expect.soft(mutatedRegister.status, mutatedRegister.combined).toBe(0);
      expect
        .soft(asRecord(staleStatus.parsed).status, 'expired pinned run should surface as suspended')
        .toBe('suspended');
      expect.soft(resume.status, resume.combined).toBe(0);
      expect
        .soft(stringValue(runRow, ['template_version', 'templateVersion']))
        .toBe(template.version);
      expect
        .soft(stringValue(commitRow ?? runRow, ['output_schema_ref', 'outputSchemaRef']))
        .toBe('mission.test.sigkill.output');
      expect
        .soft(
          sameComparableValue(originalRunBeforeKill, commitRow ?? runRow, [
            'definition_hash',
            'definitionHash',
            'template_hash',
            'templateHash',
          ]),
          'resume must keep the original template hash'
        )
        .toBe(true);
      expect
        .soft(
          sameComparableValue(originalRunBeforeKill, commitRow ?? runRow, [
            'compiler_version',
            'compilerVersion',
          ]),
          'resume must keep the original compiler version'
        )
        .toBe(true);
      expect
        .soft(
          sameComparableValue(originalRunBeforeKill, commitRow ?? runRow, [
            'registry_snapshot_hash',
            'registrySnapshotHash',
          ]),
          'resume must keep the original registry snapshot hash'
        )
        .toBe(true);
      expect
        .soft(
          sameComparableValue(originalRunBeforeKill, commitRow ?? runRow, [
            'executor_ref',
            'executorRef',
          ]),
          'resume must keep the original executor ref'
        )
        .toBe(true);
      expect
        .soft(
          sameComparableValue(originalRunBeforeKill, commitRow ?? runRow, [
            'schema_ref',
            'schemaRef',
            'output_schema_ref',
            'outputSchemaRef',
          ]),
          'resume must keep the original schema provenance'
        )
        .toBe(true);
      expect
        .soft(
          stringValue(resumedProvenance, ['fleet_manifest_version', 'fleetManifestVersion']),
          'resume must persist fleet manifest provenance'
        )
        .toBeTruthy();
      expect
        .soft(
          rowValue(resumedProvenance, [
            'model_revision',
            'modelRevision',
            'model_revisions',
            'modelRevisions',
          ]),
          'resume must persist model revision provenance'
        )
        .toBeTruthy();
      expect
        .soft(
          stringValue(resumedProvenance, ['fleet_manifest_version', 'fleetManifestVersion']),
          'resume must not switch to the mutated fleet manifest version'
        )
        .not.toBe('9.9.9');
      expect
        .soft(JSON.stringify(resumedProvenance), 'resume must not adopt the mutated model revision')
        .not.toContain('mutated-divergent-r2');
    });
  }, 90_000);

  it('AC-1/TC-2 RED: named commit crash boundaries require source-backed HOLO_TEST_CRASH_AT hooks, zero partial rows, and exact-once replay after SIGKILL', async () => {
    const hookInventory = scanMissionCrashHooks();
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-commit-boundary');
    const register = runHolo('ac-commit-boundary-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);

    const results: Array<Record<string, unknown>> = [];
    for (const boundary of commitCrashBoundaries) {
      const key = scenarioId(`commit-${boundary}`);
      const runner = startMissionRuntimeProcess(
        `ac-commit-boundary-${boundary}`,
        {
          templateKey: template.templateKey,
          goal: `Crash boundary ${boundary}`,
          idempotencyKey: key,
        },
        {
          env: {
            HOLO_TEST_CRASH_AT: `mission-commit/${boundary}`,
          },
        }
      );
      const proofBeforeKill = await waitForValue(
        `commit-${boundary}-proof`,
        () => detectCrashBoundaryProof(boundary, key, runner.snapshot()),
        { abortIf: () => runner.exited() }
      );
      const killRequested =
        Boolean(proofBeforeKill) && !runner.exited() ? runner.kill('SIGKILL') : false;
      const crashed = await runner.result;
      const observedRun = await findRunByIdempotencyKey(key);
      const boundaryProof =
        proofBeforeKill ??
        (await detectCrashBoundaryProof(boundary, key, {
          stdout: crashed.stdout,
          stderr: crashed.stderr,
          parsed: crashed.parsed,
        }));
      const runId =
        boundaryProof?.runId ??
        stringValue(observedRun, ['id']) ??
        runIdFromUnknown(crashed.parsed);
      const beforeReplay = await summarizeRun(runId);
      const terminalEventsBeforeReplay = await withSql((sql) => terminalEventCount(sql, runId));
      const replay = runMissionRuntime(`ac-commit-boundary-replay-${boundary}`, {
        templateKey: template.templateKey,
        goal: `Crash boundary ${boundary}`,
        idempotencyKey: key,
      });
      const authoritativeRun =
        runId ??
        runIdFromUnknown(replay.parsed) ??
        stringValue(await findRunByIdempotencyKey(key), ['id']);
      const afterReplay = await summarizeRun(authoritativeRun);
      const duplicateCommittedStages = await withSql((sql) =>
        committedStageDuplicates(sql, authoritativeRun)
      );
      const terminalEventsAfterReplay = await withSql((sql) =>
        terminalEventCount(sql, authoritativeRun)
      );

      results.push({
        boundary,
        key,
        observedRun,
        boundaryProof,
        killRequested,
        crashed,
        runId,
        beforeReplay,
        replay,
        authoritativeRun,
        afterReplay,
        duplicateCommittedStages,
        terminalEventsBeforeReplay,
        terminalEventsAfterReplay,
      });
    }

    writeArtifact('ac-commit-boundary-summary.json', {
      hookInventory,
      template,
      register,
      results,
    });

    expect.soft(register.status, register.combined).toBe(0);
    expect
      .soft(hookInventory.hasHookEnv, 'HOLO_TEST_CRASH_AT hook must exist in source')
      .toBe(true);
    expect
      .soft(
        hookInventory.hasAllNamedBoundaries,
        'all named mission-commit boundaries must exist in source'
      )
      .toBe(true);

    for (const result of results) {
      const boundary = String(result.boundary);
      const boundaryProof = (result.boundaryProof as CrashBoundaryProof | null) ?? null;
      const crashed = result.crashed as {
        wasKilled: boolean;
        signal: NodeJS.Signals | null;
        combined: string;
      };
      const beforeReplay = result.beforeReplay as RunSummary;
      const replay = result.replay as { status: number | null; combined: string };
      const afterReplay = result.afterReplay as RunSummary;
      expect
        .soft(
          boundaryProof,
          `${boundary}: must prove the requested HOLO_TEST_CRASH_AT boundary triggered via stdout/stderr/artifact/readiness or DB marker before accepting SIGKILL`
        )
        .toBeTruthy();
      expect
        .soft(
          normalizeCrashBoundaryMarker(boundaryProof?.marker),
          `${boundary}: crash marker must identify the requested boundary`
        )
        .toBe(boundary);
      expect.soft(crashed.signal, `${boundary}: child must terminate via SIGKILL`).toBe('SIGKILL');
      expect.soft(crashed.wasKilled, `${boundary}: child must actually be SIGKILLed`).toBe(true);
      expect
        .soft(
          beforeReplay.commits.length,
          `${boundary}: crash must leave zero mission_commits rows for the scoped run`
        )
        .toBe(0);
      expect
        .soft(
          result.terminalEventsBeforeReplay,
          `${boundary}: crash must leave zero terminal mission_events rows for the scoped run`
        )
        .toBe(0);
      expect
        .soft(
          String(terminalStatus(beforeReplay.run) ?? ''),
          `${boundary}: crash must not finalize mission_runs`
        )
        .not.toMatch(/completed|failed|budget_exceeded|blocked/);
      expect.soft(replay.status, `${boundary}: replay without crash hook must succeed`).toBe(0);
      expect
        .soft(afterReplay.commits.length, `${boundary}: replay must persist exactly one commit row`)
        .toBe(1);
      expect
        .soft(
          result.terminalEventsAfterReplay,
          `${boundary}: replay must persist exactly one terminal event`
        )
        .toBe(1);
      expect
        .soft(
          result.duplicateCommittedStages,
          `${boundary}: replay must not duplicate committed stages`
        )
        .toBe(0);
    }
  }, 90_000);

  it('AC-2/TC-3 RED: identical idempotency key replays exactly once, produces no duplicate stage/event/telemetry rows, and conflicting input fails closed', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-idempotent-replay');
    const register = runHolo('ac-idempotent-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const replayKey = scenarioId('idempotent-replay');
    const goal = 'Replay should return stored result without re-execution.';

    const firstRunner = startMissionRuntimeProcess('ac-idempotent-first', {
      templateKey: template.templateKey,
      goal,
      idempotencyKey: replayKey,
    });
    const secondRunner = startMissionRuntimeProcess('ac-idempotent-second', {
      templateKey: template.templateKey,
      goal,
      idempotencyKey: replayKey,
    });
    const [first, second] = await Promise.all([firstRunner.result, secondRunner.result]);
    const third = runMissionRuntime('ac-idempotent-third', {
      templateKey: template.templateKey,
      goal,
      idempotencyKey: replayKey,
    });
    const conflicting = runMissionRuntime('ac-idempotent-conflict', {
      templateKey: template.templateKey,
      goal: 'Different goal must fail for the same idempotency key.',
      idempotencyKey: replayKey,
    });

    const firstPayload = asRecord(first.parsed);
    const secondPayload = asRecord(second.parsed);
    const thirdPayload = asRecord(third.parsed);
    const runId =
      runIdFromUnknown(firstPayload) ??
      runIdFromUnknown(secondPayload) ??
      runIdFromUnknown(thirdPayload) ??
      stringValue(await findRunByIdempotencyKey(replayKey), ['id']);

    await withSql(async (sql) => {
      const runRows = await selectMissionRunsByIdempotencyKey(sql, replayKey);
      const stageRuns = runId ? await selectMissionStageRuns(sql, runId) : [];
      const commits = runId ? await selectMissionCommits(sql, runId) : [];
      const events = runId ? await selectMissionEvents(sql, runId) : [];
      const telemetry = runId ? await selectInferenceTelemetry(sql, runId) : [];
      const duplicateCommittedStages = await committedStageDuplicates(sql, runId);
      const terminalEvents = await terminalEventCount(sql, runId);

      writeArtifact('ac-idempotent-summary.json', {
        template,
        register,
        first,
        second,
        third,
        conflicting,
        runRows,
        stageRuns,
        commits,
        events,
        telemetry,
        duplicateCommittedStages,
        terminalEvents,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(first.status, first.combined).toBe(0);
      expect.soft(second.status, second.combined).toBe(0);
      expect.soft(third.status, third.combined).toBe(0);
      expect.soft(runId, 'run id must be stable across replay').toBeTruthy();
      expect.soft(runIdFromUnknown(secondPayload)).toBe(runIdFromUnknown(firstPayload));
      expect.soft(runIdFromUnknown(thirdPayload)).toBe(runIdFromUnknown(firstPayload));
      expect
        .soft(
          Boolean(secondPayload.replay) || Boolean(thirdPayload.replay),
          'one later caller must receive replay=true'
        )
        .toBe(true);
      expect
        .soft(runRows.length, 'one authoritative mission_runs row per template_key/idempotency_key')
        .toBe(1);
      expect.soft(commits.length, 'one authoritative mission_commits row').toBe(1);
      expect
        .soft(duplicateCommittedStages, 'replay must not duplicate committed stage rows')
        .toBe(0);
      expect.soft(terminalEvents, 'replay must not duplicate terminal mission_events').toBe(1);
      expect
        .soft(
          new Set(normalizedSignatures(events)).size,
          'mission_events must not duplicate normalized rows'
        )
        .toBe(events.length);
      expect
        .soft(
          new Set(normalizedSignatures(telemetry)).size,
          'replay must not duplicate normalized telemetry rows'
        )
        .toBe(telemetry.length);
      expect.soft(conflicting.status, conflicting.combined).not.toBe(0);
      expect
        .soft(conflicting.combined, conflicting.combined)
        .toMatch(/conflict|idempotency|different/i);
    });
  }, 90_000);

  it('AC-3/TC-4 RED: test.budget persists run-scoped usage, terminal commit/event, and provenance on budget_exceeded', async () => {
    const template = prepareTemplateFixture('template-test.budget.json', 'ac-budget-register');
    const register = runHolo('ac-budget-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const budgetKey = scenarioId('budget-exceeded');
    const run = runMissionRuntime('ac-budget-run', {
      templateKey: template.templateKey,
      goal: 'Spend more than one wall-ms/token/step budget.',
      idempotencyKey: budgetKey,
    });
    const payload = asRecord(run.parsed);
    const runId =
      runIdFromUnknown(payload) ?? stringValue(await findRunByIdempotencyKey(budgetKey), ['id']);

    await withSql(async (sql) => {
      const schema = await snapshotMissionSchema(sql);
      const runRow = runId ? await selectMissionRunById(sql, runId) : null;
      const commitRow = runId ? ((await selectMissionCommits(sql, runId))[0] ?? null) : null;
      const stageRuns = runId ? await selectMissionStageRuns(sql, runId) : [];
      const events = runId ? await selectMissionEvents(sql, runId) : [];
      const telemetry = runId ? await selectInferenceTelemetry(sql, runId) : [];
      const eventTypes = events
        .map((event) => stringValue(event, ['event_type', 'eventType']))
        .filter(Boolean);
      const persistedUsage = usageSnapshot(commitRow ?? runRow);
      const payloadUsage = usageSnapshot(payload);
      const consumeBudgetStageRun =
        stageRuns.find(
          (stageRun) => stringValue(stageRun, ['stage_key', 'stageKey']) === 'consume_budget'
        ) ?? null;
      const consumeBudgetTelemetry = consumeBudgetStageRun
        ? telemetry.filter(
            (row) =>
              stringValue(row, ['step_id', 'stepId']) === stringValue(consumeBudgetStageRun, ['id'])
          )
        : [];
      const successfulConsumeTelemetry =
        consumeBudgetTelemetry.find((row) => stringValue(row, ['status']) === 'success') ?? null;
      const typedOutput = asRecord(typedOutputSnapshot(commitRow ?? runRow));
      const consumeBudgetRoleResolution = roleResolutionForStage(
        commitRow ?? runRow,
        'consume_budget'
      );
      const payloadTokens = numberValue(payloadUsage, ['tokens']);
      const persistedTokens = numberValue(persistedUsage, ['tokens']);
      const payloadWallMs = numberValue(payloadUsage, ['wallMs']);
      const persistedWallMs = numberValue(persistedUsage, ['wallMs']);
      const payloadCost = numberValue(payloadUsage, ['cost']);
      const persistedCost = numberValue(persistedUsage, ['cost']);

      writeArtifact('ac-budget-summary.json', {
        template,
        register,
        run,
        payload,
        schema,
        runRow,
        commitRow,
        stageRuns,
        events,
        telemetry,
        eventTypes,
        payloadUsage,
        persistedUsage,
        consumeBudgetStageRun,
        consumeBudgetTelemetry,
        successfulConsumeTelemetry,
        typedOutput,
        consumeBudgetRoleResolution,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(run.status, run.combined).not.toBe(0);
      expect.soft(payloadUsage, 'run JSON must include typed usage').toBeTruthy();
      expect.soft(runId, 'mission run must persist a run row').toBeTruthy();
      expect
        .soft(
          missingColumns(schema.tables.mission_commits?.columns ?? [], EXPECTED_COMMIT_COLUMNS),
          'mission_commits must expose the expected commit columns'
        )
        .toEqual([]);

      if (successfulConsumeTelemetry) {
        expect.soft(payload.status, JSON.stringify(payload)).toBe('budget_exceeded');
        expect.soft(payload.errorCode, JSON.stringify(payload)).toBe('budget_exceeded');
        expect
          .soft(consumeBudgetStageRun, 'token-budget proof must reach the consume_budget stage')
          .toBeTruthy();
        expect
          .soft(commitRow, 'budget_exceeded must still persist a terminal commit row')
          .toBeTruthy();
        expect.soft(stringValue(runRow, ['status'])).toBe('budget_exceeded');
        expect.soft(stringValue(runRow, ['error_code', 'errorCode'])).toBe('budget_exceeded');
        expect
          .soft(
            eventTypes.some((eventType) => /budget/i.test(String(eventType))),
            'budget_exceeded must append a terminal event'
          )
          .toBe(true);
        expect
          .soft(
            Object.keys(persistedUsage).length,
            'budget_exceeded must persist usage fields on run/commit rows'
          )
          .toBeGreaterThan(0);
        expect
          .soft(
            detectProvenanceSnapshot(commitRow ?? runRow),
            'budget_exceeded terminal evidence must persist provenance'
          )
          .toBeTruthy();
        expect
          .soft(
            stringValue(consumeBudgetStageRun, ['role']),
            'consume_budget stage row must persist role provenance'
          )
          .toBeTruthy();
        expect
          .soft(
            stringValue(consumeBudgetStageRun, ['model_revision', 'modelRevision']),
            'consume_budget stage row must persist model revision provenance'
          )
          .toBeTruthy();
        expect
          .soft(
            stringValue(consumeBudgetStageRun, ['endpoint']),
            'consume_budget stage row must persist endpoint provenance'
          )
          .toBeTruthy();
        expect
          .soft(
            stringValue(consumeBudgetStageRun, ['role']),
            'consume_budget stage role must match runtime role resolution'
          )
          .toBe(stringValue(consumeBudgetRoleResolution, ['role']));
        expect
          .soft(
            stringValue(consumeBudgetStageRun, ['model_revision', 'modelRevision']),
            'consume_budget stage model revision must match runtime role resolution'
          )
          .toBe(stringValue(consumeBudgetRoleResolution, ['modelRevision', 'model_revision']));
        expect
          .soft(
            stringValue(consumeBudgetStageRun, ['endpoint']),
            'consume_budget stage endpoint must match runtime role resolution'
          )
          .toBe(stringValue(consumeBudgetRoleResolution, ['endpoint']));
        expect
          .soft(
            stringValue(successfulConsumeTelemetry, ['role']),
            'consume_budget telemetry role must match stage provenance'
          )
          .toBe(stringValue(consumeBudgetStageRun, ['role']));
        expect
          .soft(
            normalizeEndpointForCompare(stringValue(successfulConsumeTelemetry, ['endpoint'])),
            'consume_budget telemetry endpoint must match stage provenance'
          )
          .toBe(normalizeEndpointForCompare(stringValue(consumeBudgetStageRun, ['endpoint'])));
        expect
          .soft(
            stringValue(successfulConsumeTelemetry, ['model_id', 'modelId']),
            'consume_budget telemetry must persist model id'
          )
          .toBe(stringValue(consumeBudgetRoleResolution, ['litellmModelId', 'litellm_model_id']));
        expect
          .soft(
            numberValue(successfulConsumeTelemetry, ['total_tokens', 'totalTokens']),
            JSON.stringify(successfulConsumeTelemetry)
          )
          .toBeGreaterThan(0);
        expect.soft(payloadTokens, JSON.stringify(payloadUsage)).toBeGreaterThan(0);
        expect.soft(persistedTokens, JSON.stringify(persistedUsage)).toBeGreaterThan(0);
        expect.soft(payloadWallMs, JSON.stringify(payloadUsage)).toBeGreaterThan(0);
        expect.soft(persistedWallMs, JSON.stringify(persistedUsage)).toBeGreaterThan(0);
        expect.soft(payloadCost, JSON.stringify(payloadUsage)).toBe(0);
        expect.soft(persistedCost, JSON.stringify(persistedUsage)).toBe(0);
        expect.soft(typedOutput.goal, JSON.stringify(typedOutput)).toBe(payload.goal);
        expect.soft(typedOutput.budgetExceeded, JSON.stringify(typedOutput)).toBe(true);
      } else {
        const failureSurface = [
          JSON.stringify(payload),
          run.combined,
          JSON.stringify(runRow),
          JSON.stringify(consumeBudgetTelemetry),
        ].join('\n');

        expect
          .soft(stringValue(runRow, ['status']) ?? String(payload.status ?? ''), failureSurface)
          .toMatch(/failed|blocked/);
        expect.soft(payload.status, failureSurface).not.toBe('completed');
        expect
          .soft(
            payload.errorCode ?? stringValue(runRow, ['error_code', 'errorCode']),
            failureSurface
          )
          .toBeTruthy();
        expect
          .soft(
            failureSurface,
            'fleet-unavailable path must fail closed and must not pretend token success'
          )
          .toMatch(/fleet|role_unavailable|unavailable|probe|MISSION_FLEET_CALL_FAILED/i);
      }
    });
  }, 60_000);

  it('AC-1/AC-2/TC-2 RED: CLI template:register/run/status/resume JSON contracts expose persisted run id, status, provenance, and MISSION_NOT_FOUND errors', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-cli-contract');
    const malformedRunId = 'missing-run-id';
    const absentRunId = '11111111-1111-4111-8111-111111111111';
    const commands = {
      templateRegister: runHolo('ac-cli-template-register', [
        'mission',
        'template:register',
        template.path,
        '--json',
      ]),
      run: runHolo('ac-cli-run', [
        'mission',
        'run',
        template.templateKey,
        '--goal',
        'CLI contract should return run status/output/provenance.',
        '--idempotency-key',
        scenarioId('cli-run'),
        '--json',
      ]),
      statusMalformed: runHolo('ac-cli-status-malformed', [
        'mission',
        'status',
        malformedRunId,
        '--json',
      ]),
      statusAbsent: runHolo('ac-cli-status-absent', ['mission', 'status', absentRunId, '--json']),
      resumeMalformed: runHolo('ac-cli-resume-malformed', [
        'mission',
        'resume',
        malformedRunId,
        '--json',
      ]),
      resumeAbsent: runHolo('ac-cli-resume-absent', ['mission', 'resume', absentRunId, '--json']),
    };

    const runPayload = asRecord(commands.run.parsed);
    const runId = runIdFromUnknown(runPayload);
    const realStatus = runId
      ? runHolo('ac-cli-status-real', ['mission', 'status', runId, '--json'])
      : { status: null, stdout: '', stderr: '', combined: 'missing run id', parsed: null };
    const realStatusPayload = asRecord(realStatus.parsed);

    writeArtifact('ac-cli-contract-summary.json', {
      template,
      commands,
      realStatus,
    });

    expect.soft(commands.templateRegister.status, commands.templateRegister.combined).toBe(0);
    expect.soft(asRecord(commands.templateRegister.parsed).templateKey).toBe(template.templateKey);
    expect.soft(asRecord(commands.templateRegister.parsed).version).toBe(template.version);
    expect.soft(commands.run.status, commands.run.combined).toBe(0);
    expect.soft(runId, JSON.stringify(runPayload)).toBeTruthy();
    expect
      .soft(String(runPayload.status ?? ''), JSON.stringify(runPayload))
      .toMatch(/queued|running|completed|succeeded/);
    expect.soft(runPayload.provenance, JSON.stringify(runPayload)).toBeTruthy();
    expect.soft(realStatus.status, JSON.stringify(realStatus)).toBe(0);
    expect.soft(realStatusPayload.runId, JSON.stringify(realStatusPayload)).toBe(runId);
    expect
      .soft(realStatusPayload.templateKey, JSON.stringify(realStatusPayload))
      .toBe(template.templateKey);
    expect.soft(realStatusPayload.provenance, JSON.stringify(realStatusPayload)).toBeTruthy();
    expect.soft(commands.statusMalformed.status, commands.statusMalformed.combined).toBe(1);
    expect.soft(asRecord(commands.statusMalformed.parsed).errorCode).toBe('MISSION_NOT_FOUND');
    expect.soft(commands.statusAbsent.status, commands.statusAbsent.combined).toBe(1);
    expect.soft(asRecord(commands.statusAbsent.parsed).errorCode).toBe('MISSION_NOT_FOUND');
    expect.soft(commands.resumeMalformed.status, commands.resumeMalformed.combined).toBe(1);
    expect.soft(asRecord(commands.resumeMalformed.parsed).errorCode).toBe('MISSION_NOT_FOUND');
    expect.soft(commands.resumeAbsent.status, commands.resumeAbsent.combined).toBe(1);
    expect.soft(asRecord(commands.resumeAbsent.parsed).errorCode).toBe('MISSION_NOT_FOUND');
  }, 60_000);

  it('AC-3/TC-4 RED: repeated fresh non-replay runs produce identical typed output and provenance after stripping IDs/timestamps', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-deterministic-output');
    const register = runHolo('ac-deterministic-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const first = runMissionRuntime('ac-deterministic-first', {
      templateKey: template.templateKey,
      goal: 'Deterministic output comparison.',
      idempotencyKey: scenarioId('deterministic-first'),
    });
    const second = runMissionRuntime('ac-deterministic-second', {
      templateKey: template.templateKey,
      goal: 'Deterministic output comparison.',
      idempotencyKey: scenarioId('deterministic-second'),
    });

    const firstPayload = asRecord(first.parsed);
    const secondPayload = asRecord(second.parsed);
    const firstRunId = runIdFromUnknown(firstPayload);
    const secondRunId = runIdFromUnknown(secondPayload);
    const firstSummary = await summarizeRun(firstRunId);
    const secondSummary = await summarizeRun(secondRunId);
    const firstCommit = firstSummary.commits[0] ?? null;
    const secondCommit = secondSummary.commits[0] ?? null;
    const normalizedFirstOutput = normalizeForDeterministicCompare(
      typedOutputSnapshot(firstCommit ?? firstPayload)
    );
    const normalizedSecondOutput = normalizeForDeterministicCompare(
      typedOutputSnapshot(secondCommit ?? secondPayload)
    );
    const normalizedFirstProvenance = normalizeForDeterministicCompare(
      detectProvenanceSnapshot(firstCommit ?? firstSummary.run ?? firstPayload)
    );
    const normalizedSecondProvenance = normalizeForDeterministicCompare(
      detectProvenanceSnapshot(secondCommit ?? secondSummary.run ?? secondPayload)
    );

    writeArtifact('ac-deterministic-summary.json', {
      template,
      register,
      first,
      second,
      firstSummary,
      secondSummary,
      normalizedFirstOutput,
      normalizedSecondOutput,
      normalizedFirstProvenance,
      normalizedSecondProvenance,
    });

    expect.soft(register.status, register.combined).toBe(0);
    expect.soft(first.status, first.combined).toBe(0);
    expect.soft(second.status, second.combined).toBe(0);
    expect.soft(firstRunId, JSON.stringify(firstPayload)).toBeTruthy();
    expect.soft(secondRunId, JSON.stringify(secondPayload)).toBeTruthy();
    expect
      .soft(firstRunId, 'fresh non-replay runs must have distinct run ids')
      .not.toBe(secondRunId);
    expect
      .soft(normalizedFirstOutput, 'typed output must be deterministic')
      .toEqual(normalizedSecondOutput);
    expect
      .soft(normalizedFirstProvenance, 'provenance must be deterministic across fresh runs')
      .toEqual(normalizedSecondProvenance);
  }, 60_000);

  it('AC-2/TC-3 RED: RN HTTP create/status use a real persisted run, and 401/403 create/status calls write nothing for the scoped idempotency key', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-http-create-status');
    const register = runHolo('ac-http-create-status-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const app = createHonoApp();
    const idempotencyKey = scenarioId('http-create');
    const createBody = makeCreateBody(
      template.templateKey,
      'HTTP mission create should persist a real run row.',
      idempotencyKey
    );

    const unkeyed = await callAppJson(app, 'ac-http-create-unkeyed', 'POST', '/api/missions', {
      body: createBody,
    });
    const wrongScope = await callAppJson(
      app,
      'ac-http-create-wrong-scope',
      'POST',
      '/api/missions',
      {
        key: MCP,
        body: createBody,
      }
    );
    const runsAfterDenied = await withSql((sql) =>
      selectMissionRunsByIdempotencyKey(sql, idempotencyKey)
    );
    const created = await callAppJson(app, 'ac-http-create-rn', 'POST', '/api/missions', {
      key: RN,
      body: createBody,
    });
    const createdJson = asRecord(created.json);
    const runId =
      runIdFromUnknown(createdJson) ??
      stringValue(await findRunByIdempotencyKey(idempotencyKey), ['id']);
    const beforeDeniedStatus = await summarizeRun(runId);
    const beforeDeniedSurface = runMutationSurface(beforeDeniedStatus);
    const unkeyedStatus = await callAppJson(
      app,
      'ac-http-status-unkeyed',
      'GET',
      `/api/missions/${runId ?? 'missing-run-id'}`
    );
    const afterUnkeyedStatus = await summarizeRun(runId);
    const afterUnkeyedSurface = runMutationSurface(afterUnkeyedStatus);
    const wrongScopeStatus = await callAppJson(
      app,
      'ac-http-status-wrong-scope',
      'GET',
      `/api/missions/${runId ?? 'missing-run-id'}`,
      { key: MCP }
    );
    const afterWrongScopeStatus = await summarizeRun(runId);
    const afterWrongScopeSurface = runMutationSurface(afterWrongScopeStatus);
    const status = await callAppJson(
      app,
      'ac-http-status-rn',
      'GET',
      `/api/missions/${runId ?? 'missing-run-id'}`,
      {
        key: RN,
      }
    );
    const statusJson = asRecord(status.json);

    await withSql(async (sql) => {
      const runRows = await selectMissionRunsByIdempotencyKey(sql, idempotencyKey);
      const runRow = runId ? await selectMissionRunById(sql, runId) : null;

      writeArtifact('ac-http-create-status-summary.json', {
        template,
        register,
        createBody,
        unkeyed,
        wrongScope,
        runsAfterDenied,
        created,
        beforeDeniedStatus,
        beforeDeniedSurface,
        unkeyedStatus,
        afterUnkeyedStatus,
        afterUnkeyedSurface,
        wrongScopeStatus,
        afterWrongScopeStatus,
        afterWrongScopeSurface,
        status,
        runRows,
        runRow,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(unkeyed.status).toBe(401);
      expect.soft(wrongScope.status).toBe(403);
      expect
        .soft(runsAfterDenied.length, '401/403 create must not write a mission_runs row')
        .toBe(0);
      expect.soft(created.status, created.text).toBe(200);
      expect.soft(createdJson.ok, JSON.stringify(createdJson)).toBe(true);
      expect.soft(createdJson.note, 'placeholder responses are not allowed').toBeUndefined();
      expect.soft(runId, 'authorized create must return/persist a real run id').toBeTruthy();
      expect
        .soft(runRows.length, 'authorized create must persist exactly one scoped mission_runs row')
        .toBe(1);
      expect.soft(stringValue(runRow, ['id'])).toBe(runId);
      expect.soft(stringValue(runRow, ['template_key', 'templateKey'])).toBe(template.templateKey);
      expect
        .soft(
          detectProvenanceSnapshot(runRow),
          'authorized create must persist provenance on the run row'
        )
        .toBeTruthy();
      expect.soft(unkeyedStatus.status).toBe(401);
      expect
        .soft(afterUnkeyedSurface.runBytes, '401 status must not mutate mission_runs row bytes')
        .toBe(beforeDeniedSurface.runBytes);
      expect
        .soft(
          afterUnkeyedSurface.commitBytes,
          '401 status must not mutate mission commit/output source bytes'
        )
        .toBe(beforeDeniedSurface.commitBytes);
      expect
        .soft(afterUnkeyedSurface.eventBytes, '401 status must not append or mutate mission_events')
        .toBe(beforeDeniedSurface.eventBytes);
      expect
        .soft(
          afterUnkeyedSurface.outputBytes,
          '401 status must not mutate persisted mission output bytes'
        )
        .toBe(beforeDeniedSurface.outputBytes);
      expect.soft(wrongScopeStatus.status).toBe(403);
      expect
        .soft(afterWrongScopeSurface.runBytes, '403 status must not mutate mission_runs row bytes')
        .toBe(beforeDeniedSurface.runBytes);
      expect
        .soft(
          afterWrongScopeSurface.commitBytes,
          '403 status must not mutate mission commit/output source bytes'
        )
        .toBe(beforeDeniedSurface.commitBytes);
      expect
        .soft(
          afterWrongScopeSurface.eventBytes,
          '403 status must not append or mutate mission_events'
        )
        .toBe(beforeDeniedSurface.eventBytes);
      expect
        .soft(
          afterWrongScopeSurface.outputBytes,
          '403 status must not mutate persisted mission output bytes'
        )
        .toBe(beforeDeniedSurface.outputBytes);
      expect.soft(status.status, status.text).toBe(200);
      expect.soft(statusJson.runId, JSON.stringify(statusJson)).toBe(runId);
      expect.soft(statusJson.templateKey, JSON.stringify(statusJson)).toBe(template.templateKey);
      expect.soft(statusJson.provenance, JSON.stringify(statusJson)).toBeTruthy();
    });
  }, 60_000);

  it('AC-2/TC-3 RED: RN HTTP create rejects unsupported args before any write, differing unsupported args never replay, and valid strict args still replay', async () => {
    const template = prepareTemplateFixture(
      'template-test.echo.json',
      'ac-http-create-strict-args'
    );
    const register = runHolo('ac-http-create-strict-args-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const app = createHonoApp();
    const idempotencyKey = scenarioId('http-create-strict-args');
    const goal = 'HTTP mission create must reject unsupported args before any write.';
    const validBody = makeCreateBody(template.templateKey, goal, idempotencyKey);
    const invalidBodyOne = {
      ...validBody,
      args: {
        ...validBody.args,
        foo: 'one',
      },
    };
    const invalidBodyTwo = {
      ...validBody,
      args: {
        ...validBody.args,
        foo: 'two',
      },
    };

    const invalidOne = await callAppJson(
      app,
      'ac-http-create-strict-args-invalid-one',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: invalidBodyOne,
      }
    );
    const rowsAfterInvalidOne = await withSql((sql) =>
      selectMissionRunsByIdempotencyKey(sql, idempotencyKey)
    );
    const invalidTwo = await callAppJson(
      app,
      'ac-http-create-strict-args-invalid-two',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: invalidBodyTwo,
      }
    );
    const rowsAfterInvalidTwo = await withSql((sql) =>
      selectMissionRunsByIdempotencyKey(sql, idempotencyKey)
    );
    const validCreate = await callAppJson(
      app,
      'ac-http-create-strict-args-valid',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: validBody,
      }
    );
    const validCreateJson = asRecord(validCreate.json);
    const runId =
      runIdFromUnknown(validCreateJson) ??
      stringValue(await findRunByIdempotencyKey(idempotencyKey), ['id']);
    const validReplay = await callAppJson(
      app,
      'ac-http-create-strict-args-replay',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: validBody,
      }
    );
    const validReplayJson = asRecord(validReplay.json);
    const beforeInvalidAfterValid = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const beforeInvalidAfterValidSurface = runMutationSurface(beforeInvalidAfterValid);
    const invalidAfterValid = await callAppJson(
      app,
      'ac-http-create-strict-args-invalid-after-valid',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: {
          ...validBody,
          args: {
            ...validBody.args,
            foo: 'after-valid',
          },
        },
      }
    );
    const afterInvalidAfterValid = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const afterInvalidAfterValidSurface = runMutationSurface(afterInvalidAfterValid);

    await withSql(async (sql) => {
      const runRows = await selectMissionRunsByIdempotencyKey(sql, idempotencyKey);

      writeArtifact('ac-http-create-strict-args-summary.json', {
        template,
        register,
        validBody,
        invalidBodyOne,
        invalidBodyTwo,
        invalidOne,
        rowsAfterInvalidOne,
        invalidTwo,
        rowsAfterInvalidTwo,
        validCreate,
        validReplay,
        beforeInvalidAfterValid,
        beforeInvalidAfterValidSurface,
        invalidAfterValid,
        afterInvalidAfterValid,
        afterInvalidAfterValidSurface,
        runRows,
      });

      expect.soft(register.status, register.combined).toBe(0);
      expect.soft(invalidOne.status, invalidOne.text).toBe(422);
      expect
        .soft(asRecord(invalidOne.json).code, JSON.stringify(invalidOne.json))
        .toBe('INVALID_REQUEST');
      expect
        .soft(invalidOne.text, 'unsupported args must be rejected by the strict HTTP schema')
        .toMatch(/args|unrecognized|foo/i);
      expect
        .soft(
          rowsAfterInvalidOne.length,
          'unsupported args must be rejected before any mission_runs row is written'
        )
        .toBe(0);
      expect.soft(invalidTwo.status, invalidTwo.text).toBe(422);
      expect
        .soft(asRecord(invalidTwo.json).code, JSON.stringify(invalidTwo.json))
        .toBe('INVALID_REQUEST');
      expect
        .soft(
          rowsAfterInvalidTwo.length,
          'same template/idempotency key with differing unsupported args must not silently replay'
        )
        .toBe(0);
      expect.soft(validCreate.status, validCreate.text).toBe(200);
      expect.soft(validCreateJson.ok, JSON.stringify(validCreateJson)).toBe(true);
      expect.soft(runId, 'valid strict args must still create a real mission run').toBeTruthy();
      expect.soft(validReplay.status, validReplay.text).toBe(200);
      expect.soft(validReplayJson.runId, JSON.stringify(validReplayJson)).toBe(runId);
      expect
        .soft(Boolean(validReplayJson.replay), 'same valid template+args payload must still replay')
        .toBe(true);
      expect
        .soft(runRows.length, 'valid strict args must still persist exactly one mission_runs row')
        .toBe(1);
      expect.soft(invalidAfterValid.status, invalidAfterValid.text).toBe(422);
      expect
        .soft(
          afterInvalidAfterValidSurface.runBytes,
          'unsupported args after a valid create must not mutate mission_runs bytes'
        )
        .toBe(beforeInvalidAfterValidSurface.runBytes);
      expect
        .soft(
          afterInvalidAfterValidSurface.commitBytes,
          'unsupported args after a valid create must not mutate commit/output bytes'
        )
        .toBe(beforeInvalidAfterValidSurface.commitBytes);
      expect
        .soft(
          afterInvalidAfterValidSurface.eventBytes,
          'unsupported args after a valid create must not append mission_events rows'
        )
        .toBe(beforeInvalidAfterValidSurface.eventBytes);
      expect
        .soft(
          afterInvalidAfterValidSurface.outputBytes,
          'unsupported args after a valid create must not mutate persisted output bytes'
        )
        .toBe(beforeInvalidAfterValidSurface.outputBytes);
    });
  }, 60_000);

  it('AC-2/TC-3 RED: RN HTTP steer/verdict use the real created run, preserve run-scoped event order, and 401/403 write nothing', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-http-steer-verdict');
    const register = runHolo('ac-http-steer-verdict-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const app = createHonoApp();
    const idempotencyKey = scenarioId('http-event-create');
    const created = await callAppJson(app, 'ac-http-real-run-create', 'POST', '/api/missions', {
      key: RN,
      body: makeCreateBody(
        template.templateKey,
        'Create a real run for steer/verdict tests.',
        idempotencyKey
      ),
    });
    const createdJson = asRecord(created.json);
    const runId =
      runIdFromUnknown(createdJson) ??
      stringValue(await findRunByIdempotencyKey(idempotencyKey), ['id']);
    const beforeCounts = runId ? await summarizeRun(runId) : await summarizeRun(null);

    const unkeyedSteer = await callAppJson(
      app,
      'ac-http-steer-unkeyed',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        body: { note: 'Shift to narrower scope.' },
      }
    );
    const wrongScopeSteer = await callAppJson(
      app,
      'ac-http-steer-wrong-scope',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: MCP,
        body: { note: 'Shift to narrower scope.' },
      }
    );
    const unkeyedVerdict = await callAppJson(
      app,
      'ac-http-verdict-unkeyed',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        body: { verdict: 'advance', rationale: 'Looks good.' },
      }
    );
    const wrongScopeVerdict = await callAppJson(
      app,
      'ac-http-verdict-wrong-scope',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: MCP,
        body: { verdict: 'advance', rationale: 'Looks good.' },
      }
    );
    const afterDenied = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const rnSteer = await callAppJson(
      app,
      'ac-http-steer-rn',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: RN,
        body: { note: 'Shift to narrower scope.' },
      }
    );
    const rnVerdict = await callAppJson(
      app,
      'ac-http-verdict-rn',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: RN,
        body: { verdict: 'advance', rationale: 'Looks good.' },
      }
    );
    const finalState = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const steerJson = asRecord(rnSteer.json);
    const verdictJson = asRecord(rnVerdict.json);
    const orderedControlEvents = finalState.events.filter((event) =>
      /steer|verdict/i.test(String(rowValue(event, ['event_type', 'eventType']) ?? ''))
    );
    const controlEventTypes = orderedControlEvents.map((event) =>
      String(rowValue(event, ['event_type', 'eventType']) ?? '')
    );

    writeArtifact('ac-http-steer-verdict-summary.json', {
      template,
      register,
      created,
      runId,
      beforeCounts,
      unkeyedSteer,
      wrongScopeSteer,
      unkeyedVerdict,
      wrongScopeVerdict,
      afterDenied,
      rnSteer,
      rnVerdict,
      finalState,
      controlEventTypes,
    });

    expect.soft(register.status, register.combined).toBe(0);
    expect.soft(created.status, created.text).toBe(200);
    expect.soft(runId, 'steer/verdict tests must bind to a real created run').toBeTruthy();
    expect.soft(unkeyedSteer.status).toBe(401);
    expect.soft(wrongScopeSteer.status).toBe(403);
    expect.soft(unkeyedVerdict.status).toBe(401);
    expect.soft(wrongScopeVerdict.status).toBe(403);
    expect
      .soft(afterDenied.steering.length, '401/403 steer must write zero steering rows')
      .toBe(beforeCounts.steering.length);
    expect
      .soft(afterDenied.verdicts.length, '401/403 verdict must write zero verdict rows')
      .toBe(beforeCounts.verdicts.length);
    expect
      .soft(afterDenied.events.length, '401/403 control calls must write zero mission_events rows')
      .toBe(beforeCounts.events.length);
    expect.soft(rnSteer.status, rnSteer.text).toBe(200);
    expect.soft(rnVerdict.status, rnVerdict.text).toBe(200);
    expect.soft(steerJson.note, 'placeholder steering response is not acceptable').toBeUndefined();
    expect.soft(verdictJson.note, 'placeholder verdict response is not acceptable').toBeUndefined();
    expect
      .soft(finalState.steering.length, 'authorized steer must persist one run-scoped steering row')
      .toBe(1);
    expect
      .soft(
        finalState.verdicts.length,
        'authorized verdict must persist one run-scoped verdict row'
      )
      .toBe(1);
    expect
      .soft(
        controlEventTypes.length,
        'authorized steer+verdict must append ordered mission_events rows'
      )
      .toBe(2);
    expect
      .soft(controlEventTypes[0] ?? '', 'steer event must be ordered before verdict')
      .toMatch(/steer/i);
    expect.soft(controlEventTypes[1] ?? '', 'verdict event must come second').toMatch(/verdict/i);
  }, 60_000);

  it('AC-2/TC-3 RED: HTTP steer/verdict reject stray policy fields, derive deterministic request keys, replay duplicates, and 409 on same-key conflicts', async () => {
    const template = prepareTemplateFixture(
      'template-test.echo.json',
      'ac-http-control-idempotency'
    );
    const register = runHolo('ac-http-control-idempotency-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const app = createHonoApp();
    const idempotencyKey = scenarioId('http-control-idempotency-create');
    const created = await callAppJson(
      app,
      'ac-http-control-idempotency-create',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: makeCreateBody(
          template.templateKey,
          'Create a real run for HTTP control idempotency checks.',
          idempotencyKey
        ),
      }
    );
    const createdJson = asRecord(created.json);
    const runId =
      runIdFromUnknown(createdJson) ??
      stringValue(await findRunByIdempotencyKey(idempotencyKey), ['id']);
    const beforeRejected = runId ? await summarizeRun(runId) : await summarizeRun(null);

    const invalidSteer = await callAppJson(
      app,
      'ac-http-control-idempotency-invalid-steer',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: RN,
        body: { note: 'bad steer', stageGraph: [] },
      }
    );
    const invalidVerdict = await callAppJson(
      app,
      'ac-http-control-idempotency-invalid-verdict',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: RN,
        body: {
          verdict: 'potato',
          rationale: 'bad verdict payload',
          wipLimit: 999,
          citedKill: true,
          probeGatedAdvance: true,
        },
      }
    );
    const afterRejected = runId ? await summarizeRun(runId) : await summarizeRun(null);

    const firstSteer = await callAppJson(
      app,
      'ac-http-control-idempotency-steer-first',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: RN,
        body: { note: 'Shift to narrower scope.' },
      }
    );
    const firstSteerJson = asRecord(firstSteer.json);
    const firstSteering = asRecord(rowValue(firstSteerJson, ['steering']));
    const derivedSteerKey = stringValue(firstSteering, ['requestKey', 'request_key']);
    const secondSteer = await callAppJson(
      app,
      'ac-http-control-idempotency-steer-replay',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: RN,
        body: { note: 'Shift to narrower scope.' },
      }
    );
    const secondSteerJson = asRecord(secondSteer.json);
    const secondSteering = asRecord(rowValue(secondSteerJson, ['steering']));
    const steerConflict = await callAppJson(
      app,
      'ac-http-control-idempotency-steer-conflict',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: RN,
        body: {
          requestKey: derivedSteerKey ?? 'missing-steer-request-key',
          note: 'Conflicting steering payload.',
        },
      }
    );

    const firstVerdict = await callAppJson(
      app,
      'ac-http-control-idempotency-verdict-first',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: RN,
        body: { verdict: 'advance', rationale: 'Looks good.' },
      }
    );
    const firstVerdictJson = asRecord(firstVerdict.json);
    const firstVerdictRow = asRecord(rowValue(firstVerdictJson, ['verdict']));
    const derivedVerdictKey = stringValue(firstVerdictRow, ['requestKey', 'request_key']);
    const secondVerdict = await callAppJson(
      app,
      'ac-http-control-idempotency-verdict-replay',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: RN,
        body: { verdict: 'advance', rationale: 'Looks good.' },
      }
    );
    const secondVerdictJson = asRecord(secondVerdict.json);
    const secondVerdictRow = asRecord(rowValue(secondVerdictJson, ['verdict']));
    const verdictConflict = await callAppJson(
      app,
      'ac-http-control-idempotency-verdict-conflict',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: RN,
        body: {
          requestKey: derivedVerdictKey ?? 'missing-verdict-request-key',
          verdict: 'redirect',
          rationale: 'Conflicting verdict payload.',
        },
      }
    );
    const finalState = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const controlEventTypes = finalState.events
      .filter((event) =>
        /steer|verdict/i.test(String(rowValue(event, ['event_type', 'eventType']) ?? ''))
      )
      .map((event) => String(rowValue(event, ['event_type', 'eventType']) ?? ''));

    writeArtifact('ac-http-control-idempotency-summary.json', {
      template,
      register,
      created,
      runId,
      beforeRejected,
      invalidSteer,
      invalidVerdict,
      afterRejected,
      firstSteer,
      secondSteer,
      steerConflict,
      firstVerdict,
      secondVerdict,
      verdictConflict,
      finalState,
      derivedSteerKey,
      derivedVerdictKey,
      controlEventTypes,
    });

    expect.soft(register.status, register.combined).toBe(0);
    expect.soft(created.status, created.text).toBe(200);
    expect.soft(runId, 'idempotency test must bind to a real created run').toBeTruthy();
    expect.soft(invalidSteer.status, invalidSteer.text).toBe(422);
    expect.soft(invalidVerdict.status, invalidVerdict.text).toBe(422);
    expect
      .soft(afterRejected.steering.length, '422 steer must write zero steering rows')
      .toBe(beforeRejected.steering.length);
    expect
      .soft(afterRejected.verdicts.length, '422 verdict must write zero verdict rows')
      .toBe(beforeRejected.verdicts.length);
    expect
      .soft(afterRejected.events.length, '422 control calls must write zero mission_events rows')
      .toBe(beforeRejected.events.length);
    expect.soft(firstSteer.status, firstSteer.text).toBe(200);
    expect.soft(asRecord(firstSteer.json).replay, JSON.stringify(firstSteer.json)).toBe(false);
    expect.soft(derivedSteerKey, JSON.stringify(firstSteering)).toBeTruthy();
    expect.soft(secondSteer.status, secondSteer.text).toBe(200);
    expect.soft(asRecord(secondSteer.json).replay, JSON.stringify(secondSteer.json)).toBe(true);
    expect
      .soft(
        stringValue(secondSteering, ['requestKey', 'request_key']),
        JSON.stringify(secondSteering)
      )
      .toBe(derivedSteerKey);
    expect.soft(steerConflict.status, steerConflict.text).toBe(409);
    expect.soft(firstVerdict.status, firstVerdict.text).toBe(200);
    expect.soft(asRecord(firstVerdict.json).replay, JSON.stringify(firstVerdict.json)).toBe(false);
    expect.soft(derivedVerdictKey, JSON.stringify(firstVerdictRow)).toBeTruthy();
    expect.soft(secondVerdict.status, secondVerdict.text).toBe(200);
    expect.soft(asRecord(secondVerdict.json).replay, JSON.stringify(secondVerdict.json)).toBe(true);
    expect
      .soft(
        stringValue(secondVerdictRow, ['requestKey', 'request_key']),
        JSON.stringify(secondVerdictRow)
      )
      .toBe(derivedVerdictKey);
    expect.soft(verdictConflict.status, verdictConflict.text).toBe(409);
    expect.soft(finalState.steering.length, JSON.stringify(finalState.steering)).toBe(1);
    expect.soft(finalState.verdicts.length, JSON.stringify(finalState.verdicts)).toBe(1);
    expect.soft(controlEventTypes.length, JSON.stringify(controlEventTypes)).toBe(2);
    expect.soft(controlEventTypes[0] ?? '').toMatch(/steer/i);
    expect.soft(controlEventTypes[1] ?? '').toMatch(/verdict/i);
    expect
      .soft(
        stringValue(finalState.steering[0], ['request_key', 'requestKey']),
        JSON.stringify(finalState.steering[0])
      )
      .toBe(derivedSteerKey);
    expect
      .soft(
        stringValue(finalState.verdicts[0], ['request_key', 'requestKey']),
        JSON.stringify(finalState.verdicts[0])
      )
      .toBe(derivedVerdictKey);
  }, 60_000);

  it('AC-2/TC-3 RED: RN may only access RN-owned runs while control administers runtime-owned runs', async () => {
    const template = prepareTemplateFixture('template-test.echo.json', 'ac-http-owner-scope');
    const register = runHolo('ac-http-owner-scope-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const runtimeRun = runMissionRuntime('ac-http-owner-scope-runtime-run', {
      templateKey: template.templateKey,
      goal: 'Runtime-owned mission for HTTP owner-scope checks.',
      idempotencyKey: scenarioId('http-owner-scope-runtime'),
    });
    const runtimeRunPayload = asRecord(runtimeRun.parsed);
    const runId = runIdFromUnknown(runtimeRunPayload);
    const app = createHonoApp();
    const beforeDenied = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const beforeDeniedSurface = runMutationSurface(beforeDenied);

    const rnStatus = await callAppJson(
      app,
      'ac-http-owner-scope-rn-status',
      'GET',
      `/api/missions/${runId ?? 'missing-run-id'}`,
      { key: RN }
    );
    const rnSteer = await callAppJson(
      app,
      'ac-http-owner-scope-rn-steer',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: RN,
        body: { note: 'RN should not administer runtime-owned runs.' },
      }
    );
    const rnVerdict = await callAppJson(
      app,
      'ac-http-owner-scope-rn-verdict',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: RN,
        body: { verdict: 'advance', rationale: 'RN should not administer runtime-owned runs.' },
      }
    );
    const afterDenied = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const afterDeniedSurface = runMutationSurface(afterDenied);

    const controlStatus = await callAppJson(
      app,
      'ac-http-owner-scope-control-status',
      'GET',
      `/api/missions/${runId ?? 'missing-run-id'}`,
      { key: CONTROL }
    );
    const controlSteer = await callAppJson(
      app,
      'ac-http-owner-scope-control-steer',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/steer`,
      {
        key: CONTROL,
        body: {
          requestKey: scenarioId('http-owner-scope-control-steer'),
          note: 'Control admin steer.',
        },
      }
    );
    const controlVerdict = await callAppJson(
      app,
      'ac-http-owner-scope-control-verdict',
      'POST',
      `/api/missions/${runId ?? 'missing-run-id'}/verdicts`,
      {
        key: CONTROL,
        body: {
          requestKey: scenarioId('http-owner-scope-control-verdict'),
          verdict: 'redirect',
          rationale: 'Control admin verdict.',
        },
      }
    );
    const afterControl = runId ? await summarizeRun(runId) : await summarizeRun(null);

    writeArtifact('ac-http-owner-scope-summary.json', {
      template,
      register,
      runtimeRun,
      runId,
      beforeDenied,
      beforeDeniedSurface,
      rnStatus,
      rnSteer,
      rnVerdict,
      afterDenied,
      afterDeniedSurface,
      controlStatus,
      controlSteer,
      controlVerdict,
      afterControl,
    });

    expect.soft(register.status, register.combined).toBe(0);
    expect.soft(runtimeRun.status, runtimeRun.combined).toBe(0);
    expect.soft(runId, JSON.stringify(runtimeRunPayload)).toBeTruthy();
    expect
      .soft(
        stringValue(beforeDenied.run, ['owner_scope', 'ownerScope']),
        JSON.stringify(beforeDenied.run)
      )
      .toBe('runtime');
    expect.soft(rnStatus.status, rnStatus.text).toBe(403);
    expect.soft(rnSteer.status, rnSteer.text).toBe(403);
    expect.soft(rnVerdict.status, rnVerdict.text).toBe(403);
    expect
      .soft(afterDeniedSurface.runBytes, '403 status must not mutate the runtime-owned run row')
      .toBe(beforeDeniedSurface.runBytes);
    expect
      .soft(afterDeniedSurface.eventBytes, '403 owner-scope denials must not append mission_events')
      .toBe(beforeDeniedSurface.eventBytes);
    expect
      .soft(afterDeniedSurface.commitBytes, '403 owner-scope denials must not mutate commits')
      .toBe(beforeDeniedSurface.commitBytes);
    expect.soft(controlStatus.status, controlStatus.text).toBe(200);
    expect.soft(asRecord(controlStatus.json).runId, JSON.stringify(controlStatus.json)).toBe(runId);
    expect.soft(controlSteer.status, controlSteer.text).toBe(200);
    expect.soft(asRecord(controlSteer.json).replay, JSON.stringify(controlSteer.json)).toBe(false);
    expect.soft(controlVerdict.status, controlVerdict.text).toBe(200);
    expect
      .soft(asRecord(controlVerdict.json).replay, JSON.stringify(controlVerdict.json))
      .toBe(false);
    expect.soft(afterControl.steering.length, JSON.stringify(afterControl.steering)).toBe(1);
    expect.soft(afterControl.verdicts.length, JSON.stringify(afterControl.verdicts)).toBe(1);
    expect
      .soft(
        afterControl.events.length - beforeDenied.events.length,
        JSON.stringify(afterControl.events)
      )
      .toBe(2);
  }, 60_000);

  it('AC-2/TC-3 RED: RN create against a runtime-owned same-key run returns an opaque 409 and writes nothing', async () => {
    const template = prepareTemplateFixture(
      'template-test.echo.json',
      'ac-http-owner-scope-create-collision'
    );
    const register = runHolo('ac-http-owner-scope-create-collision-register', [
      'mission',
      'template:register',
      template.path,
      '--json',
    ]);
    const idempotencyKey = scenarioId('http-owner-scope-create-collision');
    const goal = 'Runtime-owned mission for HTTP create collision checks.';
    const runtimeRun = runMissionRuntime('ac-http-owner-scope-create-collision-runtime-run', {
      templateKey: template.templateKey,
      goal,
      idempotencyKey,
      operator: 'holo',
    });
    const runtimeRunPayload = asRecord(runtimeRun.parsed);
    const runId = runIdFromUnknown(runtimeRunPayload);
    const app = createHonoApp();
    const beforeCollision = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const beforeRows = await withSql((sql) =>
      selectMissionRunsByIdempotencyKey(sql, idempotencyKey)
    );
    const collision = await callAppJson(
      app,
      'ac-http-owner-scope-create-collision-rn',
      'POST',
      '/api/missions',
      {
        key: RN,
        body: {
          templateKey: template.templateKey,
          goal,
          idempotencyKey,
          args: {
            goal,
            operator: 'holo',
          },
        },
      }
    );
    const collisionJson = asRecord(collision.json);
    const afterCollision = runId ? await summarizeRun(runId) : await summarizeRun(null);
    const afterRows = await withSql((sql) =>
      selectMissionRunsByIdempotencyKey(sql, idempotencyKey)
    );
    const uuidPattern =
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

    writeArtifact('ac-http-owner-scope-create-collision-summary.json', {
      template,
      register,
      runtimeRun,
      runId,
      beforeCollision,
      beforeRows,
      collision,
      afterCollision,
      afterRows,
    });

    expect.soft(register.status, register.combined).toBe(0);
    expect.soft(runtimeRun.status, runtimeRun.combined).toBe(0);
    expect.soft(runId, JSON.stringify(runtimeRunPayload)).toBeTruthy();
    expect
      .soft(
        stringValue(beforeCollision.run, ['owner_scope', 'ownerScope']),
        JSON.stringify(beforeCollision.run)
      )
      .toBe('runtime');
    expect.soft(beforeRows.length, JSON.stringify(beforeRows)).toBe(1);
    expect.soft(collision.status, collision.text).toBe(409);
    expect
      .soft(collisionJson.code, JSON.stringify(collisionJson))
      .toBe('MISSION_IDEMPOTENCY_CONFLICT');
    expect
      .soft(collisionJson.errorCode, JSON.stringify(collisionJson))
      .toBe('MISSION_IDEMPOTENCY_CONFLICT');
    expect.soft(collisionJson.runId, JSON.stringify(collisionJson)).toBeUndefined();
    expect
      .soft(collision.text, '409 create collision body must not contain any UUID')
      .not.toMatch(uuidPattern);
    if (runId) {
      expect
        .soft(collision.text, '409 create collision body must not leak the foreign run id')
        .not.toContain(runId);
    }
    expect
      .soft(
        canonicalJsonBytes(afterRows),
        '409 create collision must not insert or mutate mission_runs rows for the idempotency key'
      )
      .toBe(canonicalJsonBytes(beforeRows));
    expect
      .soft(
        canonicalJsonBytes(afterCollision),
        '409 create collision must not mutate the runtime-owned run or any related rows'
      )
      .toBe(canonicalJsonBytes(beforeCollision));
  }, 60_000);

  describe.sequential('Sprint 23 gate-4 RED: deterministic human gate and fulcrum seams', () => {
    async function seedGate4Run(
      label: string,
      options?: { goal?: string; fixture?: 'template-test.echo.json' | 'template-research.json' }
    ) {
      const goal = options?.goal ?? `Gate 4 public_api seed: ${label}.`;
      const template = prepareTemplateFixture(
        options?.fixture ?? 'template-test.echo.json',
        `gate-4-${label}`
      );
      const register = runHolo(`gate-4-${label}-register`, [
        'mission',
        'template:register',
        template.path,
        '--json',
      ]);
      const app = createHonoApp();
      const idempotencyKey = scenarioId(`gate-4-${label}`);
      const created = await callAppJson(
        app,
        `gate-4-${label}-public-api-create`,
        'POST',
        '/api/missions',
        {
          key: RN,
          body: makeCreateBody(template.templateKey, goal, idempotencyKey),
        }
      );
      const runId =
        runIdFromUnknown(asRecord(created.json)) ??
        stringValue(await findRunByIdempotencyKey(idempotencyKey), ['id']);
      return { app, created, goal, idempotencyKey, register, runId, template };
    }

    it('gate-1 uncited-kill rejected: a kill without immutable evidence citations must not enter the ledger', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock database or direct INSERT.
      // GIVEN: a real HTTP-created mission run with zero evidence citations.
      // WHEN: a human submits an uncited kill through the real verdict HTTP surface.
      // THEN: the server refuses it with 403 and leaves zero verdict/event ledger rows.
      // MUST_OBSERVE: Expected status 403 and 0 persisted rows; MUST_NOT_OBSERVE: a kill row/event.
      const seeded = await seedGate4Run('uncited-kill');
      const response = await callAppJson(
        seeded.app,
        'gate-4-uncited-kill-verdict',
        'POST',
        `/api/missions/${seeded.runId ?? 'missing-run-id'}/verdicts`,
        { key: RN, body: { verdict: 'kill', rationale: 'Stop now, without a citation.' } }
      );
      const summary = await summarizeRun(seeded.runId);
      expect({
        created: seeded.created.status,
        eventRows: summary.events.filter(
          (row) => rowValue(row, ['event_type', 'eventType']) === 'verdict'
        ).length,
        status: response.status,
        verdictRows: summary.verdicts.length,
      }).toEqual({ created: 200, eventRows: 0, status: 403, verdictRows: 0 });
    }, 60_000);

    it('gate-1 WIP=1: a second active run for the same human gate is refused before a row is created', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock database or direct INSERT.
      // GIVEN: one real mission run has the exact persisted same-subject templateKey plus goal identity.
      // WHEN: the same actor creates a second run through the real HTTP surface.
      // THEN: the second request is refused with 403 and exactly one run remains for this gate.
      // MUST_OBSERVE: Expected status 403 and COUNT(*) 1; MUST_NOT_OBSERVE: a second run row.
      const sameSubjectGoal = 'Gate 4 same-subject research goal';
      const template = prepareTemplateFixture('template-test.echo.json', 'gate-4-same-subject');
      const register = runHolo('gate-4-same-subject-register', [
        'mission',
        'template:register',
        template.path,
        '--json',
      ]);
      const app = createHonoApp();
      const [first, second] = await Promise.all([
        callAppJson(app, 'gate-4-same-subject-first-public-api-create', 'POST', '/api/missions', {
          key: RN,
          body: makeCreateBody(
            template.templateKey,
            sameSubjectGoal,
            scenarioId('gate-4-same-subject-first')
          ),
        }),
        callAppJson(app, 'gate-4-same-subject-second-public-api-create', 'POST', '/api/missions', {
          key: RN,
          body: makeCreateBody(
            template.templateKey,
            sameSubjectGoal,
            scenarioId('gate-4-same-subject-second')
          ),
        }),
      ]);
      const rows = await withSql((sql) =>
        selectMissionRunsByTemplateKey(sql, template.templateKey)
      );
      const activeSameSubjectRows = rows.filter(
        (row) =>
          stringValue(row, ['goal']) === sameSubjectGoal &&
          ['pending', 'running', 'suspended'].includes(stringValue(row, ['status']) ?? '')
      );
      expect({
        activeSameSubjectRunCount: activeSameSubjectRows.length,
        concurrentHttpStatuses: [first.status, second.status].sort((left, right) => left - right),
        dbConcurrencyTripwireSubjectRows: rows.filter(
          (row) => stringValue(row, ['goal']) === sameSubjectGoal
        ).length,
        registerStatus: register.status,
      }).toEqual({
        activeSameSubjectRunCount: 1,
        concurrentHttpStatuses: [200, 403],
        dbConcurrencyTripwireSubjectRows: 1,
        registerStatus: 0,
      });
    }, 60_000);

    it('gate-1 unprobed-advance refused: advance requires a persisted probe before a verdict row can be written', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock database or direct INSERT.
      // GIVEN: a real run with no successful human-gate probe recorded for its current cycle.
      // WHEN: a human posts advance→validated through the real verdict HTTP surface.
      // THEN: the server returns 403 and commits zero validated verdict/event rows.
      // MUST_OBSERVE: Expected status 403 and 0 rows; MUST_NOT_OBSERVE: an unprobed validated transition.
      const seeded = await seedGate4Run('unprobed-advance');
      const response = await callAppJson(
        seeded.app,
        'gate-4-unprobed-advance-verdict',
        'POST',
        `/api/missions/${seeded.runId ?? 'missing-run-id'}/verdicts`,
        {
          key: RN,
          body: {
            verdict: 'advance',
            targetStatus: 'validated',
            rationale: 'Advance to validated despite no deterministic probe.',
          },
        }
      );
      const summary = await summarizeRun(seeded.runId);
      expect({
        advanceEvents: summary.events.filter(
          (row) => rowValue(row, ['event_type', 'eventType']) === 'verdict'
        ).length,
        validatedAdvanceVerdicts: summary.verdicts.filter(
          (row) => rowValue(row, ['verdict']) === 'advance'
        ).length,
        status: response.status,
      }).toEqual({ advanceEvents: 0, status: 403, validatedAdvanceVerdicts: 0 });
    }, 60_000);

    it('gate-1 failed gate mutation rolls back: an uncited kill leaves no partial verdict or event rows', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock database or direct INSERT.
      // GIVEN: a real mission run and an uncited kill request that must fail atomically.
      // WHEN: the request crosses the real Hono verdict route.
      // THEN: the rejection is 403 and the append-only ledger has zero partial mutations.
      // MUST_OBSERVE: Expected status 403, 0 verdicts, 0 control events; MUST_NOT_OBSERVE: partial rows.
      const seeded = await seedGate4Run('atomic-rollback');
      const before = await summarizeRun(seeded.runId);
      const response = await callAppJson(
        seeded.app,
        'gate-4-atomic-rollback-kill',
        'POST',
        `/api/missions/${seeded.runId ?? 'missing-run-id'}/verdicts`,
        {
          key: RN,
          body: { verdict: 'kill', rationale: 'This uncited kill must roll back atomically.' },
        }
      );
      const after = await summarizeRun(seeded.runId);
      expect({
        eventRowsAdded: after.events.length - before.events.length,
        status: response.status,
        verdictRowsAdded: after.verdicts.length - before.verdicts.length,
      }).toEqual({ eventRowsAdded: 0, status: 403, verdictRowsAdded: 0 });
    }, 60_000);

    it('gate-2 steering-next-cycle: a steering instruction is applied to the next cycle output', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock fleet response or direct INSERT.
      // GIVEN: a real run with a next-cycle instruction to prioritize recent papers.
      // WHEN: the instruction is posted through the real steer HTTP surface and holo mission:cycle runs.
      // THEN: the following real cycle output exposes that exact applied constraint.
      // MUST_OBSERVE: "recent papers" in cycle output; MUST_NOT_OBSERVE: unknown command or unchanged output.
      const seeded = await seedGate4Run('steering-next-cycle', {
        fixture: 'template-research.json',
      });
      const instruction = 'Prioritize recent papers published in 2025 and 2026.';
      const steer = await callAppJson(
        seeded.app,
        'gate-4-steering-next-cycle',
        'POST',
        `/api/missions/${seeded.runId ?? 'missing-run-id'}/steer`,
        { key: RN, body: { instruction } }
      );
      const cycle = runHolo('gate-4-steering-next-cycle-real-cycle', [
        'mission:cycle',
        seeded.runId ?? 'missing-run-id',
        '--json',
      ]);
      const cycleJson = asRecord(cycle.parsed);
      const cyclePayload = asRecord(cycleJson.cycle);
      const persisted = await summarizeRun(seeded.runId);
      const persistedSteering = persisted.steering[0];
      expect({
        cycleSteeringMatchesPersistedInstruction:
          JSON.stringify(cyclePayload.steeringApplied) ===
          JSON.stringify([stringValue(persistedSteering, ['instruction'])]),
        cycleStatus: cycle.status,
        persistedSteeringRows: persisted.steering.length,
        steeringApplied: cyclePayload.steeringApplied,
        steerStatus: steer.status,
        unknownCommand: /unknown command/i.test(cycle.combined),
      }).toEqual({
        cycleSteeringMatchesPersistedInstruction: true,
        cycleStatus: 0,
        persistedSteeringRows: 1,
        steeringApplied: ['Prioritize recent papers published in 2025 and 2026.'],
        steerStatus: 200,
        unknownCommand: false,
      });
    }, 60_000);

    it('gate-2 ASSAY≠CHALLENGE: real assay and challenge executions expose distinct fleet instance IDs', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock fleet response or direct INSERT.
      // GIVEN: a real research-bound run whose assay and challenge are independent fleet executions.
      // WHEN: holo mission:cycle executes the real following cycle and returns its JSON projection.
      // THEN: assayInstanceId and challengeInstanceId are concrete and different UUID-like instance IDs.
      // MUST_OBSERVE: two unequal instance IDs; MUST_NOT_OBSERVE: equal or placeholder instance IDs.
      const seeded = await seedGate4Run('assay-challenge-distinct-instances', {
        fixture: 'template-research.json',
      });
      const cycle = runHolo('gate-4-assay-challenge-real-fleet-cycle', [
        'mission:cycle',
        seeded.runId ?? 'missing-run-id',
        '--json',
      ]);
      const payload = asRecord(asRecord(cycle.parsed).cycle);
      const persisted = await summarizeRun(seeded.runId);
      const assayStage = persisted.stageRuns.find(
        (row) => stringValue(row, ['stage_key', 'stageKey']) === 'assay'
      );
      const challengeStage = persisted.stageRuns.find(
        (row) => stringValue(row, ['stage_key', 'stageKey']) === 'challenge'
      );
      const persistedAssayTrace = persisted.telemetry.find(
        (row) => stringValue(row, ['step_id', 'stepId']) === 'assay'
      );
      const persistedChallengeTrace = persisted.telemetry.find(
        (row) => stringValue(row, ['step_id', 'stepId']) === 'challenge'
      );
      const persistedAssayInstanceId = stringValue(persistedAssayTrace, ['trace_id', 'traceId']);
      const persistedChallengeInstanceId = stringValue(persistedChallengeTrace, [
        'trace_id',
        'traceId',
      ]);
      expect({
        assayInstanceId: payload.assayInstanceId,
        challengeInstanceId: payload.challengeInstanceId,
        distinct: payload.assayInstanceId !== payload.challengeInstanceId,
        cycleStatus: cycle.status,
        cliAssayMatchesPersistedTrace: payload.assayInstanceId === persistedAssayInstanceId,
        cliChallengeMatchesPersistedTrace:
          payload.challengeInstanceId === persistedChallengeInstanceId,
        persistedIdsAreConcrete:
          Boolean(persistedAssayInstanceId && persistedChallengeInstanceId) &&
          !/assay|challenge|pending|unknown|placeholder/i.test(
            `${persistedAssayInstanceId}:${persistedChallengeInstanceId}`
          ),
        persistedAssayStage: stringValue(assayStage, ['stage_key', 'stageKey']),
        persistedChallengeStage: stringValue(challengeStage, ['stage_key', 'stageKey']),
        persistedFleetTraceRows: persisted.telemetry.length,
      }).toEqual({
        assayInstanceId: expect.any(String),
        challengeInstanceId: expect.any(String),
        distinct: true,
        cycleStatus: 0,
        cliAssayMatchesPersistedTrace: true,
        cliChallengeMatchesPersistedTrace: true,
        persistedIdsAreConcrete: true,
        persistedAssayStage: 'assay',
        persistedChallengeStage: 'challenge',
        persistedFleetTraceRows: 2,
      });
    }, 60_000);

    it('gate-2 admission parity: refuting claims survive the ASSAY to CHALLENGE evidence handoff', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock fleet response or direct INSERT.
      // GIVEN: a real run steered to retain comparable supporting and refuting claims for the next cycle.
      // WHEN: steering is persisted through the HTTP surface and holo mission:cycle executes the handoff.
      // THEN: the admission surface reports the refuting claim as retained, not silently filtered.
      // MUST_OBSERVE: refuting claim count 1; MUST_NOT_OBSERVE: filtered count 0 or absent admission proof.
      const seeded = await seedGate4Run('admission-parity', { fixture: 'template-research.json' });
      const refutingClaim = 'The primary hypothesis is contradicted by the latest replication.';
      const steer = await callAppJson(
        seeded.app,
        'gate-4-admission-parity-steer',
        'POST',
        `/api/missions/${seeded.runId ?? 'missing-run-id'}/steer`,
        { key: RN, body: { instruction: `Retain this refuting claim: ${refutingClaim}` } }
      );
      const cycle = runHolo('gate-4-admission-parity-real-cycle', [
        'mission:cycle',
        seeded.runId ?? 'missing-run-id',
        '--json',
      ]);
      const payload = asRecord(asRecord(cycle.parsed).cycle);
      const assayInstanceId = String(payload.assayInstanceId ?? 'placeholder:assay');
      const challengeInstanceId = String(payload.challengeInstanceId ?? 'placeholder:challenge');
      const admission = asRecord(payload.admission);
      const persisted = await summarizeRun(seeded.runId);
      const persistedAssayTrace = persisted.telemetry.find(
        (row) => stringValue(row, ['step_id', 'stepId']) === 'assay'
      );
      const persistedChallengeTrace = persisted.telemetry.find(
        (row) => stringValue(row, ['step_id', 'stepId']) === 'challenge'
      );
      const persistedAssayInstanceId = stringValue(persistedAssayTrace, ['trace_id', 'traceId']);
      const persistedChallengeInstanceId = stringValue(persistedChallengeTrace, [
        'trace_id',
        'traceId',
      ]);
      const persistedAdmission = asRecord(typedOutputSnapshot(persisted.commits.at(-1)));
      expect({
        cycleAdmissionMatchesPersistedRefuting:
          admission.refutingAdmitted === persistedAdmission.refutingAdmitted &&
          admission.refutingFiltered === persistedAdmission.refutingFiltered,
        cycleAdmissionMatchesPersistedSupporting:
          admission.supportingAdmitted === persistedAdmission.supportingAdmitted,
        cycleStatus: cycle.status,
        cliAssayEqualsPersistedTrace: assayInstanceId === persistedAssayInstanceId,
        cliChallengeEqualsPersistedTrace: challengeInstanceId === persistedChallengeInstanceId,
        persistedIdsAreConcrete:
          Boolean(persistedAssayInstanceId && persistedChallengeInstanceId) &&
          !/assay|challenge|pending|unknown|placeholder/i.test(
            `${persistedAssayInstanceId}:${persistedChallengeInstanceId}`
          ),
        persistedAdmissionEvidenceRows: persisted.commits.length,
        persistedSteeringRows: persisted.steering.length,
        refutingClaimsAdmitted: admission.refutingAdmitted,
        refutingClaimsFiltered: admission.refutingFiltered,
        supportingClaimsAdmitted: admission.supportingAdmitted,
        steerStatus: steer.status,
      }).toEqual({
        cycleAdmissionMatchesPersistedRefuting: true,
        cycleAdmissionMatchesPersistedSupporting: true,
        cycleStatus: 0,
        cliAssayEqualsPersistedTrace: true,
        cliChallengeEqualsPersistedTrace: true,
        persistedIdsAreConcrete: true,
        persistedAdmissionEvidenceRows: 1,
        persistedSteeringRows: 1,
        refutingClaimsAdmitted: 1,
        refutingClaimsFiltered: 0,
        steerStatus: 200,
        supportingClaimsAdmitted: 1,
      });
    }, 60_000);

    it('gate-2 CLI evidence surface: assay and challenge report concrete non-placeholder instance IDs', async () => {
      // SCENARIO: real Postgres + public_api seed; no mock fleet response or direct INSERT.
      // GIVEN: a real HTTP-created run eligible for the CLI/status evidence projection.
      // WHEN: the Gate 2-owned holo mission:cycle command is run after a real cycle request.
      // THEN: concrete assay/challenge instance IDs are emitted rather than placeholder values.
      // MUST_OBSERVE: two concrete IDs and zero placeholders; MUST_NOT_OBSERVE: "pending" or "unknown" IDs.
      const seeded = await seedGate4Run('cli-instance-ids', { fixture: 'template-research.json' });
      const cycle = runHolo('gate-4-cli-instance-ids-cycle', [
        'mission:cycle',
        seeded.runId ?? 'missing-run-id',
        '--json',
      ]);
      const payload = asRecord(asRecord(cycle.parsed).cycle);
      const persisted = await summarizeRun(seeded.runId);
      const assayInstanceId = String(payload.assayInstanceId ?? 'placeholder:assay');
      const challengeInstanceId = String(payload.challengeInstanceId ?? 'placeholder:challenge');
      const persistedAssayTrace = persisted.telemetry.find(
        (row) => stringValue(row, ['step_id', 'stepId']) === 'assay'
      );
      const persistedChallengeTrace = persisted.telemetry.find(
        (row) => stringValue(row, ['step_id', 'stepId']) === 'challenge'
      );
      const persistedAssayInstanceId = stringValue(persistedAssayTrace, ['trace_id', 'traceId']);
      const persistedChallengeInstanceId = stringValue(persistedChallengeTrace, [
        'trace_id',
        'traceId',
      ]);
      expect({
        assayInstanceId,
        challengeInstanceId,
        hasPlaceholder: /placeholder|pending|unknown/i.test(
          `${assayInstanceId}:${challengeInstanceId}`
        ),
        cycleIndex: payload.index,
        cycleStatus: cycle.status,
        cliAssayEqualsPersistedTrace: assayInstanceId === persistedAssayInstanceId,
        cliChallengeEqualsPersistedTrace: challengeInstanceId === persistedChallengeInstanceId,
        idsAreUnequal: assayInstanceId !== challengeInstanceId,
        persistedIdsAreConcrete:
          Boolean(persistedAssayInstanceId && persistedChallengeInstanceId) &&
          !/assay|challenge|pending|unknown|placeholder/i.test(
            `${persistedAssayInstanceId}:${persistedChallengeInstanceId}`
          ),
        persistedFleetTraceRows: persisted.telemetry.length,
        unknownCommand: /unknown command/i.test(cycle.combined),
      }).toEqual({
        assayInstanceId: expect.any(String),
        challengeInstanceId: expect.any(String),
        hasPlaceholder: false,
        cycleIndex: 1,
        cycleStatus: 0,
        cliAssayEqualsPersistedTrace: true,
        cliChallengeEqualsPersistedTrace: true,
        idsAreUnequal: true,
        persistedIdsAreConcrete: true,
        persistedFleetTraceRows: 2,
        unknownCommand: false,
      });
    }, 60_000);
  });
});

function schemaHasColumns(
  schema: Awaited<ReturnType<typeof snapshotMissionSchema>>,
  table: keyof Awaited<ReturnType<typeof snapshotMissionSchema>>['tables'],
  columns: readonly string[]
): boolean {
  return missingColumns(schema.tables[table]?.columns ?? [], columns).length === 0;
}
