/**
 * Tests for telemetry mutations (recordTriage, deleteOldTelemetry)
 *
 * AC-1: recordTriage inserts row with all fields
 * AC-2: rawLlmResponse is truncated to 2000 chars
 * AC-3: classificationSource validates against union
 * AC-4: deleteOldTelemetry removes rows older than cutoff
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';

// Mock DB for testing
type MockInsert = Mock & {
  mockResolvedValue: (value: any) => any;
};

type MockDb = {
  insert: MockInsert;
  query: Mock;
  get: Mock;
  delete: Mock;
};

describe('telemetryMutations', () => {
  let mockDb: MockDb;
  let mockCtx: any;

  beforeEach(() => {
    mockDb = {
      insert: vi.fn().mockResolvedValue('telemetry123') as MockInsert,
      query: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    };

    mockCtx = {
      db: mockDb,
    };
  });

  /**
   * AC-1: recordTriage inserts row with all fields
   */
  describe('AC-1: recordTriage inserts', () => {
    it('should insert a telemetry row with all required fields', async () => {
      const { recordTriage } = await import('../../convex/chat/telemetryMutations');

      const args = {
        conversationId: 'conv123' as any,
        messageId: 'msg456' as any,
        intent: 'research',
        queryShape: 'comprehensive',
        confidence: 'high' as const,
        reasoning: 'User wants to research something',
        classificationSource: 'llm' as const,
        rawLlmResponse: JSON.stringify({
          intent: 'research',
          queryShape: 'comprehensive',
          confidence: 'high',
          reasoning: 'User wants to research something',
        }),
        totalDurationMs: 150,
      };

      await (recordTriage as any)(mockCtx, args);

      // Verify db.insert was called with correct table and all fields
      expect(mockDb.insert).toHaveBeenCalledWith('agentTelemetry', expect.objectContaining({
        conversationId: 'conv123',
        messageId: 'msg456',
        intent: 'research',
        queryShape: 'comprehensive',
        confidence: 'high',
        classificationSource: 'llm',
        reasoning: 'User wants to research something',
        rawLlmResponse: expect.stringContaining('research'),
        totalDurationMs: 150,
        createdAt: expect.any(Number),
      }));
    });
  });

  /**
   * AC-2: rawLlmResponse is truncated to 2000 chars
   */
  describe('AC-2: truncates rawLlmResponse', () => {
    it('should truncate rawLlmResponse to 2000 characters', async () => {
      const { recordTriage } = await import('../../convex/chat/telemetryMutations');

      // Create a response longer than 2000 chars
      const longResponse = 'x'.repeat(2500);

      const args = {
        conversationId: 'conv123' as any,
        messageId: 'msg456' as any,
        intent: 'conversation',
        queryShape: 'factual',
        confidence: 'medium' as const,
        reasoning: 'Short question',
        classificationSource: 'heuristic' as const,
        rawLlmResponse: longResponse,
        totalDurationMs: 50,
      };

      await (recordTriage as any)(mockCtx, args);

      // Verify the response was truncated to exactly 2000 chars
      const insertCall = mockDb.insert.mock.calls[0];
      const insertedData = insertCall[1];
      expect(insertedData.rawLlmResponse.length).toBe(2000);
      expect(insertedData.rawLlmResponse).not.toBe(longResponse);
    });

    it('should not truncate short responses', async () => {
      const { recordTriage } = await import('../../convex/chat/telemetryMutations');

      const shortResponse = 'short response';

      const args = {
        conversationId: 'conv123' as any,
        messageId: 'msg456' as any,
        intent: 'knowledge',
        queryShape: 'factual',
        confidence: 'high' as const,
        reasoning: 'Short question',
        classificationSource: 'llm' as const,
        rawLlmResponse: shortResponse,
        totalDurationMs: 10,
      };

      await (recordTriage as any)(mockCtx, args);

      const insertCall = mockDb.insert.mock.calls[0];
      const insertedData = insertCall[1];
      expect(insertedData.rawLlmResponse).toBe(shortResponse);
    });
  });

  /**
   * AC-3: classificationSource validates against union
   */
  describe('AC-3: validates classificationSource', () => {
    it('should accept all valid classificationSource values', async () => {
      const { recordTriage } = await import('../../convex/chat/telemetryMutations');

      const validSources = [
        'triage_agent',
        'heuristic',
        'manual_override',
        'cached',
      ] as const;

      for (const source of validSources) {
        mockDb.insert.mockClear();
        mockDb.insert.mockResolvedValue(`telemetry_${source}`);

        const args = {
          conversationId: 'conv123' as any,
          messageId: 'msg456' as any,
          intent: 'conversation',
          queryShape: 'factual',
          confidence: 'low' as const,
          reasoning: 'Test',
          classificationSource: source,
          rawLlmResponse: '{}',
          totalDurationMs: 0,
        };

        await (recordTriage as any)(mockCtx, args);

        expect(mockDb.insert).toHaveBeenCalledWith('agentTelemetry', expect.objectContaining({
          classificationSource: source,
        }));
      }
    });
  });

  /**
   * AC-4: deleteOldTelemetry removes rows older than cutoff
   * Updated for REL-002: now uses olderThanMs instead of cutoffTimestamp,
   * and batches deletes via withIndex + take instead of collect.
   */
  describe('AC-4: deleteOldTelemetry', () => {
    it('should delete telemetry rows older than cutoff date', async () => {
      const { deleteOldTelemetry } = await import('../../convex/chat/telemetryMutations');

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      // Mock query to return old telemetry records via take-based batching
      const oldTelemetry = {
        _id: 'old123',
        createdAt: now - thirtyDaysMs - 1000, // Older than cutoff
      };

      mockDb.query.mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          take: vi.fn().mockResolvedValue([oldTelemetry]),
        }),
      });

      mockDb.delete.mockResolvedValue(undefined);

      const result = await (deleteOldTelemetry as any)(mockCtx, { olderThanMs: thirtyDaysMs });

      // Verify delete was called for old records
      expect(mockDb.delete).toHaveBeenCalledWith('old123');
      expect(result).toEqual({ deleted: 1 });
    });

    it('should not delete recent telemetry rows', async () => {
      const { deleteOldTelemetry } = await import('../../convex/chat/telemetryMutations');

      const oneMinuteMs = 60 * 1000;

      // Mock query to return empty batch (no old records)
      mockDb.query.mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          take: vi.fn().mockResolvedValue([]),
        }),
      });

      const result = await (deleteOldTelemetry as any)(mockCtx, { olderThanMs: oneMinuteMs });

      // Verify delete was NOT called for recent records
      expect(mockDb.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: 0 });
    });

    it('should return count of deleted records', async () => {
      const { deleteOldTelemetry } = await import('../../convex/chat/telemetryMutations');

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      // Mock multiple old records in one batch
      const oldRecords = [
        { _id: 'old1', createdAt: now - 40 * 24 * 60 * 60 * 1000 },
        { _id: 'old2', createdAt: now - 35 * 24 * 60 * 60 * 1000 },
        { _id: 'old3', createdAt: now - 31 * 24 * 60 * 60 * 1000 },
      ];

      // First call returns records, second call returns empty (done)
      mockDb.query.mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          take: vi.fn().mockResolvedValueOnce(oldRecords).mockResolvedValueOnce([]),
        }),
      });

      mockDb.delete.mockResolvedValue(undefined);

      const result = await (deleteOldTelemetry as any)(mockCtx, { olderThanMs: thirtyDaysMs });

      // Should return count of deleted records
      expect(result).toEqual({ deleted: 3 });
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
    });
  });
});
