import { describe, expect, it } from 'vitest';
import { runHolo } from '../../../tests/integration/mission-red.helpers';

type JsonRecord = Record<string, unknown>;

const MISSION_USAGE = `holo mission template:register <file> [--json]
       holo mission run <template> --goal '<text>' --idempotency-key <key> [--json]
       holo mission resume <run-id> [--json]
       holo mission status <run-id> [--json]
       holo mission run research --goal '<text>' [--json]
       holo mission run report --kind <revenue-validation|competitive|ai-roi|flights> --target <host> [--destination <route>] [--json]
       holo mission run whatsNew --date YYYY-MM-DD [--json]
       holo mission run assimilate --target <owner/repo> [--json]
       holo mission run shop --query <term> [--json]
       holo mission run subscriptions [--topic <text>] [--json]`;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {};
}

describe('Sprint 15 mission CLI --json validation contracts', () => {
  it.each([
    {
      artifactBase: 'mission-json-template-path-required',
      args: ['mission', 'template:register', '--json'],
      status: 2,
      code: 'MISSION_TEMPLATE_PATH_REQUIRED',
      error: 'mission template:register requires a JSON file path',
      usage: 'holo mission template:register <file> [--json]',
    },
    {
      artifactBase: 'mission-json-goal-required',
      args: ['mission', 'run', 'research', '--json'],
      status: 2,
      code: 'MISSION_GOAL_REQUIRED',
      error: 'mission run research requires --topic <text> or --goal <text>',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-unknown-flag',
      args: ['mission', 'run', 'research', '--json', '--wat'],
      status: 2,
      code: 'MISSION_UNKNOWN_FLAG',
      error: 'unknown flag: --wat',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-template-required',
      args: ['mission', 'run', '--json'],
      status: 2,
      code: 'MISSION_TEMPLATE_REQUIRED',
      error: 'mission run requires <template>',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-run-goal-required',
      args: ['mission', 'run', 'foo', '--json'],
      status: 2,
      code: 'MISSION_GOAL_REQUIRED',
      error: 'mission run foo requires --goal <text>',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-run-idempotency-required',
      args: ['mission', 'run', 'foo', '--goal', 'hello', '--json'],
      status: 2,
      code: 'MISSION_IDEMPOTENCY_KEY_REQUIRED',
      error: 'mission run foo requires --idempotency-key <key>',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-resume-run-id-required',
      args: ['mission', 'resume', '--json'],
      status: 2,
      code: 'MISSION_RUN_ID_REQUIRED',
      error: 'mission resume requires <run-id>',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-status-run-id-required',
      args: ['mission', 'status', '--json'],
      status: 2,
      code: 'MISSION_RUN_ID_REQUIRED',
      error: 'mission status requires <run-id>',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-subcommand-required',
      args: ['mission', '--json'],
      status: 2,
      code: 'MISSION_SUBCOMMAND_REQUIRED',
      error: 'mission requires subcommand (template:register | run | resume | status)',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-unknown-command',
      args: ['mission', 'wat', '--json'],
      status: 2,
      code: 'MISSION_COMMAND_UNKNOWN',
      error: 'unknown command: mission wat',
      usage: MISSION_USAGE,
    },
  ])('$artifactBase', ({ artifactBase, args, status, code, error, usage }) => {
    const result = runHolo(artifactBase, args);
    const payload = asRecord(result.parsed);

    expect(result.status, result.combined).toBe(status);
    expect(result.stdout.trim(), result.combined).toMatch(/^\{/);
    expect(payload.ok, JSON.stringify(payload)).toBe(false);
    expect(payload.error, JSON.stringify(payload)).toBe(error);
    expect(payload.code, JSON.stringify(payload)).toBe(code);
    expect(payload.errorCode, JSON.stringify(payload)).toBe(code);
    expect(payload.usage, JSON.stringify(payload)).toBe(usage);
  });
});
