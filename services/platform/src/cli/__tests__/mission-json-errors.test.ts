import { describe, expect, it } from 'vitest';
import { runHolo } from '../../../tests/integration/mission-red.helpers';

type JsonRecord = Record<string, unknown>;

const MISSION_USAGE =
  "holo mission template:register <file> [--json]\n       holo mission run research --goal '<text>' [--json]";

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
      error: 'mission run research requires --goal <text>',
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
      artifactBase: 'mission-json-run-unimplemented',
      args: ['mission', 'run', 'foo', '--json'],
      status: 1,
      code: 'MISSION_ONE_SURFACE_UNIMPLEMENTED',
      error: 'mission run foo is not implemented in mission-1 (contracts/schema only)',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-resume-unimplemented',
      args: ['mission', 'resume', 'missing-run-id', '--json'],
      status: 1,
      code: 'MISSION_ONE_SURFACE_UNIMPLEMENTED',
      error:
        'mission resume missing-run-id is not implemented in mission-1 (contracts/schema only)',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-status-unimplemented',
      args: ['mission', 'status', 'missing-run-id', '--json'],
      status: 1,
      code: 'MISSION_ONE_SURFACE_UNIMPLEMENTED',
      error:
        'mission status missing-run-id is not implemented in mission-1 (contracts/schema only)',
      usage: MISSION_USAGE,
    },
    {
      artifactBase: 'mission-json-subcommand-required',
      args: ['mission', '--json'],
      status: 2,
      code: 'MISSION_SUBCOMMAND_REQUIRED',
      error: 'mission requires subcommand (template:register | run research)',
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
