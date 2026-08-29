/**
 * CAP-BAK-01 / D05-05 / REDHAT-FIX-C4 — monthly fire-drill mission template.
 *
 * Mission DSL is on-demand only (MissionTriggerSchema). Monthly cadence is
 * external launchd: packages/platform/deploy/launchd/holocron-fire-drill-monthly.plist
 * — never embed schedule/cron inside this definition.
 *
 * Live schema (0017_mission_contracts.sql):
 *   mission_templates.template_key
 *   mission_runs.template_key, status (lowercase check), typed_output_json, error_message
 * No mission_key / output_artifacts / failure_reason columns.
 *
 * CLI:
 *   holo mission template:register packages/platform/src/mission/templates/fire-drill-monthly.json
 *   holo mission run fire-drill-monthly --goal "…" --idempotency-key …
 *   holo restore:fire-drill … (direct path the stage executor invokes)
 */
import type { MissionTemplateDefinition } from '../contract.ts';

export const FIRE_DRILL_MONTHLY_TEMPLATE_KEY = 'fire-drill-monthly' as const;
export const FIRE_DRILL_MONTHLY_TEMPLATE_VERSION = '1.0.0' as const;

/**
 * Operator-facing checklist steps (definition_json.steps). Complements stageGraph.
 * Monthly cadence is NOT here — see launchd plist.
 */
export const FIRE_DRILL_MONTHLY_STEPS = [
  {
    id: 'pre-drill-isolation',
    command:
      'holo restore:fire-drill --target-timestamp <ISO> --scratch <empty-pgdata> --blob-dir <empty-blob-dir> --report <parity-report.json>',
    description:
      'Confirm scratch PGDATA and blob-dir are empty and distinct from live mini mounts before starting.',
    artifacts: [] as string[],
  },
  {
    id: 'run-fire-drill',
    command: 'holo restore:fire-drill',
    description:
      'Pre-failure snapshot → PITR Postgres restore → restic blob restore → unified parity report.',
    artifacts: ['parity-report.json'],
  },
  {
    id: 'verify-parity',
    command:
      "jq '{ok, POSTGRES_PARITY_PASS, LEDGER_CHECKSUM_MATCH, BLOB_PARITY_PASS}' <parity-report.json>",
    description:
      "Mission fails closed (status='failed', error_message contains PARITY) if any PARITY_PASS flag is false.",
    artifacts: ['parity-report.json'],
  },
] as const;

export const fireDrillMonthlyTemplateDefinition: MissionTemplateDefinition = {
  templateKey: FIRE_DRILL_MONTHLY_TEMPLATE_KEY,
  version: FIRE_DRILL_MONTHLY_TEMPLATE_VERSION,
  description:
    'CAP-BAK-01 fire drill (on-demand): run holo restore:fire-drill on scratch targets, emit parity-report.json into typed_output_json, set status=failed + error_message when any PARITY_PASS is false. Monthly cadence is external launchd (holocron-fire-drill-monthly.plist), not mission DSL.',
  // On-demand only — MissionTriggerSchema.strict() rejects schedule triggers.
  trigger: { kind: 'on-demand' },
  // Operator checklist; monthly cadence lives in launchd, not here.
  steps: FIRE_DRILL_MONTHLY_STEPS.map((step) => ({
    ...step,
    artifacts: [...step.artifacts],
  })),
  stageGraph: [
    {
      id: 'execute',
      stageKind: 'fire-drill.execute@1',
      executorRef: 'builtin.fire-drill-execute@1',
      inputSchema: { schemaRef: 'mission.goal', schemaVersion: 1 },
      outputSchema: { schemaRef: 'mission.fire-drill.output', schemaVersion: 1 },
    },
  ],
  toolGrants: [],
  modelRoleBindings: {},
  budgets: {
    wallMs: 3_600_000,
    tokens: 0,
    cost: 0,
    maxSteps: 4,
  },
  gateRubric: null,
  humanGate: null,
  outputContract: {
    schemaRef: 'mission.fire-drill.output',
    schemaVersion: 1,
  },
  parameterSchema: {
    targetTimestamp: {
      type: 'string',
      required: false,
      description:
        'ISO-8601 PITR target (defaults to ~1h ago or HOLO_FIRE_DRILL_TARGET_TIMESTAMP). Never hardcode in the template.',
    },
    scratch: {
      type: 'string',
      required: false,
      description:
        'Empty scratch PGDATA directory (never live mini PGDATA). Env: HOLO_FIRE_DRILL_SCRATCH.',
    },
    blobDir: {
      type: 'string',
      required: false,
      description:
        'Empty blob restore directory (never live mini blobs). Env: HOLO_FIRE_DRILL_BLOB_DIR.',
    },
    reportPath: {
      type: 'string',
      required: false,
      description: 'Where to write parity-report.json. Env: HOLO_FIRE_DRILL_REPORT.',
    },
  },
};
