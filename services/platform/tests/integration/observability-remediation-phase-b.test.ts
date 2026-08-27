/**
 * OBS remediation — phase B focused tests (B1/B2/B3/B5).
 *
 *   B1  chat_runs.trace_id carries a valid W3C trace id (32 lowercase hex),
 *       derived deterministically from the run id — never `chat:${runId}`.
 *   B2  Buffered spans carry sessionId (run/conversation identity) and
 *       deployment attributes (environment/releaseSha/imageDigest) that the
 *       allowlist admits; sourced from the deployer-injected env.
 *   B3  One mission root span per run: model generations nest under the
 *       mission root (single traceId, real parent-child timing), not a
 *       synthetic per-call root.
 *   B5  Generation spans carry token usage (+cost when known) as flattened
 *       usage* metadata keys.
 *
 * All seams are pure/unit: a stub exporter records enqueueSpan payloads.
 */

import type { AnyExportedSpan } from '@mastra/core/observability';
import type { Mastra } from '@mastra/core/mastra';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatRunTraceId } from '../../src/http/chat-runs.ts';
import {
  bufferMissionModelCall,
  bufferMissionRootSpan,
  deploymentSpanAttributes,
  runWithMissionSpanContext,
  type SpanUsage,
} from '../../src/observability/langfuse-exporter.ts';
import {
  registerAgentOnObservabilityMastra,
  setResearchMastra,
} from '../../src/research/research-mastra.ts';

type RecordedSpan = AnyExportedSpan & { sessionId?: string };

function stubExporter(): {
  exporter: {
    resolvedServiceName: string;
    enqueueSpan: ReturnType<typeof vi.fn>;
  };
  spans: () => RecordedSpan[];
} {
  const enqueueSpan = vi.fn();
  const spans = () => enqueueSpan.mock.calls.map((call) => call[0] as RecordedSpan);
  return {
    exporter: { resolvedServiceName: 'holocron-platform', enqueueSpan },
    spans,
  };
}

describe('OBS remediation B1 — valid W3C trace id for chat runs', () => {
  it('derives a 32-lowercase-hex trace id from the run id', () => {
    const runId = '0f0f77d0-9b7e-4c1e-8a2c-abcdefabcdef';
    const traceId = chatRunTraceId(runId);
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic per run (claim retries keep one trace) and distinct across runs', () => {
    const a = '11111111-1111-1111-1111-111111111111';
    const b = '22222222-2222-2222-2222-222222222222';
    expect(chatRunTraceId(a)).toBe(chatRunTraceId(a));
    expect(chatRunTraceId(a)).not.toBe(chatRunTraceId(b));
  });

  it('never contains the legacy chat: prefix', () => {
    expect(chatRunTraceId('run-x')).not.toContain('chat:');
  });
});

describe('OBS remediation B2 — sessionId + deployment attributes on spans', () => {
  const ENV_KEYS = ['HOLO_ENVIRONMENT', 'NODE_ENV', 'HOLO_SOURCE_REVISION', 'HOLO_IMAGE_DIGEST'];
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key] as string;
    }
  });

  it('stamps sessionId on root + generation spans, defaulting to runId', () => {
    const { exporter, spans } = stubExporter();
    bufferMissionModelCall(exporter as never, {
      traceId: 'a'.repeat(32),
      runId: 'run-b2',
      endpoint: '/research/test',
      modelId: 'test-model',
      startTime: new Date(),
      endTime: new Date(),
    });
    const recorded = spans();
    expect(recorded).toHaveLength(2);
    for (const span of recorded) expect(span.sessionId).toBe('run-b2');
  });

  it('prefers an explicit sessionId (conversation identity)', () => {
    const { exporter, spans } = stubExporter();
    bufferMissionModelCall(exporter as never, {
      traceId: 'a'.repeat(32),
      runId: 'run-b2',
      sessionId: 'conv-77',
      endpoint: '/chat/test',
      startTime: new Date(),
      endTime: new Date(),
    });
    for (const span of spans()) expect(span.sessionId).toBe('conv-77');
  });

  it('injects environment/releaseSha/imageDigest from deployer env into span metadata', () => {
    process.env.HOLO_ENVIRONMENT = 'production';
    process.env.HOLO_SOURCE_REVISION = 'a'.repeat(40);
    process.env.HOLO_IMAGE_DIGEST = 'sha256:' + 'b'.repeat(64);
    const { exporter, spans } = stubExporter();
    bufferMissionModelCall(exporter as never, {
      traceId: 'a'.repeat(32),
      runId: 'run-b2-env',
      endpoint: '/research/test',
      startTime: new Date(),
      endTime: new Date(),
    });
    for (const span of spans()) {
      const metadata = span.metadata as Record<string, unknown>;
      expect(metadata.environment).toBe('production');
      expect(metadata.releaseSha).toBe('a'.repeat(40));
      expect(metadata.imageDigest).toBe('sha256:' + 'b'.repeat(64));
    }
  });

  it('deploymentSpanAttributes falls back to NODE_ENV then development', () => {
    expect(deploymentSpanAttributes({}).environment).toBe('development');
    expect(deploymentSpanAttributes({ NODE_ENV: 'test' } as NodeJS.ProcessEnv).environment).toBe(
      'test'
    );
    expect(
      deploymentSpanAttributes({
        NODE_ENV: 'test',
        HOLO_ENVIRONMENT: 'laptop',
      } as NodeJS.ProcessEnv).environment
    ).toBe('laptop');
  });
});

describe('OBS remediation B5 — usage attributes on generation spans', () => {
  it('flattens token usage + cost into usage* metadata keys on the generation span', () => {
    const { exporter, spans } = stubExporter();
    const usage: SpanUsage = {
      inputTokens: 120,
      outputTokens: 80,
      totalTokens: 200,
      costUsd: 0.0137,
    };
    bufferMissionModelCall(exporter as never, {
      traceId: 'a'.repeat(32),
      runId: 'run-b5',
      endpoint: '/research/test',
      modelId: 'test-model',
      usage,
      startTime: new Date(),
      endTime: new Date(),
    });
    const generation = spans().find((s) => s.type === 'model_generation');
    expect(generation).toBeDefined();
    const metadata = generation?.metadata as Record<string, unknown>;
    expect(metadata.usageInputTokens).toBe(120);
    expect(metadata.usageOutputTokens).toBe(80);
    expect(metadata.usageTotalTokens).toBe(200);
    expect(metadata.usageCostUsd).toBe(0.0137);
  });

  it('omits usage keys entirely when no usage is known', () => {
    const { exporter, spans } = stubExporter();
    bufferMissionModelCall(exporter as never, {
      traceId: 'a'.repeat(32),
      runId: 'run-b5-none',
      endpoint: '/research/test',
      startTime: new Date(),
      endTime: new Date(),
    });
    const generation = spans().find((s) => s.type === 'model_generation');
    const metadata = generation?.metadata as Record<string, unknown>;
    expect(metadata).not.toHaveProperty('usageInputTokens');
    expect(metadata).not.toHaveProperty('usageCostUsd');
  });
});

describe('OBS remediation B3 — one mission root span per run', () => {
  it('nests generations under the mission root when a span context is bound', async () => {
    const { exporter, spans } = stubExporter();
    const start = new Date();
    const end = new Date(start.getTime() + 1500);
    await runWithMissionSpanContext(
      { runId: 'run-b3', traceId: 'f'.repeat(32), rootSpanId: 'root123', sessionId: 'sess-b3' },
      async () => {
        bufferMissionModelCall(exporter as never, {
          // Deliberately WRONG traceId/sessionId: the bound context must win.
          traceId: 'e'.repeat(32),
          runId: 'run-b3',
          sessionId: 'ignored-session',
          endpoint: '/research/test',
          modelId: 'test-model',
          startTime: start,
          endTime: end,
        });
      }
    );
    // Exactly one span: the generation. No synthetic per-call root inside a mission.
    const recorded = spans();
    expect(recorded).toHaveLength(1);
    const generation = recorded[0];
    expect(generation.type).toBe('model_generation');
    expect(generation.traceId).toBe('f'.repeat(32));
    expect(generation.sessionId).toBe('sess-b3');
    expect(generation.parentSpanId).toBe('root123');
    expect(generation.isRootSpan).toBe(false);
  });

  it('outside a mission context, keeps the synthetic root (standalone visibility)', () => {
    const { exporter, spans } = stubExporter();
    bufferMissionModelCall(exporter as never, {
      traceId: 'a'.repeat(32),
      runId: 'run-b3-standalone',
      endpoint: '/research/test',
      startTime: new Date(),
      endTime: new Date(),
    });
    const recorded = spans();
    expect(recorded).toHaveLength(2);
    const roots = recorded.filter((s) => s.isRootSpan);
    expect(roots).toHaveLength(1);
    const generation = recorded.find((s) => s.type === 'model_generation');
    expect(generation?.parentSpanId).toBe(roots[0]?.id);
  });

  it('bufferMissionRootSpan emits the single root with mission_run metadata', () => {
    const { exporter, spans } = stubExporter();
    bufferMissionRootSpan(exporter as never, {
      runId: 'run-b3-root',
      traceId: 'f'.repeat(32),
      startTime: new Date(),
      endTime: new Date(),
      status: 'completed',
      attempt: 1,
    });
    const recorded = spans();
    expect(recorded).toHaveLength(1);
    const root = recorded[0];
    expect(root.name).toBe('research-mission');
    expect(root.isRootSpan).toBe(true);
    expect(root.traceId).toBe('f'.repeat(32));
    expect(root.sessionId).toBe('run-b3-root'); // defaults to runId
    const metadata = root.metadata as Record<string, unknown>;
    expect(metadata.spanType).toBe('mission_run');
    expect(metadata.status).toBe('completed');
    expect(metadata.attempt).toBe(1);
  });
});

describe('OBS remediation B4 — chat agent registered on the observability Mastra', () => {
  it('binds standalone agents to the process Mastra instance via __registerMastra', () => {
    const fakeInstance = { __obsTestInstance: true } as unknown as Mastra;
    setResearchMastra(fakeInstance);
    const register = vi.fn();
    registerAgentOnObservabilityMastra({ __registerMastra: register });
    expect(register).toHaveBeenCalledTimes(1);
    // Identity matters: the agent must be bound to the live process instance.
    expect(register.mock.calls[0]?.[0]).toBe(fakeInstance);
  });
});
