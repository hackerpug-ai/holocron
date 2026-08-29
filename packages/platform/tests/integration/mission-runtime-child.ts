import {
  getMissionRunStatus,
  resumeMissionRun,
  runMissionTemplate,
} from '../../src/mission/runtime.ts';

type RuntimeCommand =
  | {
      command: 'run';
      templateKey: string;
      goal: string;
      idempotencyKey: string;
      operator?: string;
      databaseUrl?: string;
    }
  | {
      command: 'resume';
      runId: string;
      databaseUrl?: string;
    }
  | {
      command: 'status';
      runId: string;
      databaseUrl?: string;
    };

function parsePayload(): RuntimeCommand {
  const command = process.argv[2];
  const raw = process.argv[3];
  if (!command || !raw) {
    throw new Error('usage: bun mission-runtime-child.ts <run|resume|status> <json-payload>');
  }

  const payload = JSON.parse(raw) as Record<string, unknown>;
  if (command === 'run') {
    return {
      command,
      templateKey: String(payload.templateKey ?? ''),
      goal: String(payload.goal ?? ''),
      idempotencyKey: String(payload.idempotencyKey ?? ''),
      operator: payload.operator ? String(payload.operator) : undefined,
      databaseUrl: payload.databaseUrl ? String(payload.databaseUrl) : undefined,
    };
  }

  if (command === 'resume' || command === 'status') {
    return {
      command,
      runId: String(payload.runId ?? ''),
      databaseUrl: payload.databaseUrl ? String(payload.databaseUrl) : undefined,
    };
  }

  throw new Error(`unknown runtime command: ${command}`);
}

async function main(): Promise<void> {
  const request = parsePayload();

  try {
    const result =
      request.command === 'run'
        ? await runMissionTemplate(
            {
              templateKey: request.templateKey,
              goal: request.goal,
              idempotencyKey: request.idempotencyKey,
              operator: request.operator,
            },
            { databaseUrl: request.databaseUrl }
          )
        : request.command === 'resume'
          ? await resumeMissionRun(request.runId, { databaseUrl: request.databaseUrl })
          : await getMissionRunStatus(request.runId, { databaseUrl: request.databaseUrl });

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    const payload = {
      ok: false,
      errorCode:
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code ?? 'MISSION_RUNTIME_FAILED')
          : 'MISSION_RUNTIME_FAILED',
      error: error instanceof Error ? error.message : String(error),
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exitCode = 1;
  }
}

await main();
