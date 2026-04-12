/**
 * Tests for telemetry mutations (recordTriage, deleteOldTelemetry)
 *
 * AC-1: recordTriage inserts row with all fields
 * AC-2: rawLlmResponse is truncated to 2000 chars
 * AC-3: classificationSource validates against union
 * AC-4: deleteOldTelemetry removes rows older than cutoff
 */

import { describe, it, expect, vi } from 'vitest';

// Mock DB for testing
type MockInsert = vi.Mock & {
  mockResolvedValue: (value: any) => any;
};

type MockDb = {
  insert: MockInsert;
  query: vi.Mock;
  get: vi.Mock;
  delete: vi.Mock;
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
        confidence: 'high' as const,
        classificationSource: 'triage_agent' as const,
        rawLlmResponse: JSON.stringify({
          intent: 'research',
          confidence: 'high',
          reasoning: 'User wants to research something',
        }),
        processingMs: 150,
      };

      await recordTriage(mockCtx, args);

      // Verify db.insert was called with correct table and all fields
      expect(mockDb.insert).toHaveBeenCalledWith('agentTelemetry', expect.objectContaining({
        conversationId: 'conv123',
        messageId: 'msg456',
        intent: 'research',
        confidence: 'high',
        classificationSource: 'triage_agent',
        rawLlmResponse: expect.stringContaining('research'),
        processingMs: 150,
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
        intent: 'conversation' as const,
        confidence: 'medium' as const,
        classificationSource: 'heuristic' as const,
        rawLlmResponse: longResponse,
        processingMs: 50,
      };

      await recordTriage(mockCtx, args);

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
        intent: 'knowledge' as const,
        confidence: 'high' as const,
        classificationSource: 'manual_override' as const,
        rawLlmResponse: shortResponse,
        processingMs: 10,
      };

      await recordTriage(mockCtx, args);

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
          intent: 'conversation' as const,
          confidence: 'low' as const,
          classificationSource: source,
          rawLlmResponse: '{}',
          processingMs: 0,
        };

        await recordTriage(mockCtx, args);

        expect(mockDb.insert).toHaveBeenCalledWith('agentTelemetry', expect.objectContaining({
          classificationSource: source,
        }));
      }
    });
  });

  /**
   * AC-4: deleteOldTelemetry removes rows older than cutoff
   */
  describe('AC-4: deleteOldTelemetry', () => {
    it('should delete telemetry rows older than cutoff date', async () => {
      const { deleteOldTelemetry } = await import('../../convex/chat/telemetryMutations');

      const now = Date.now();
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const cutoffTimestamp = now - thirtyDaysMs;

      // Mock query to return old telemetry records
      const oldTelemetry = {
        _id: 'old123',
        createdAt: now - thirtyDaysMs - 1000, // Older than cutoff
      };

      mockDb.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([oldTelemetry]),
      });

      mockDb.delete.mockResolvedValue(undefined);

      await deleteOldTelemetry(mockCtx, { cutoffTimestamp });

      // Verify delete was called for old records
      expect(mockDb.delete).toHaveBeenCalledWith('old123');
    });

    it('should not delete recent telemetry rows', async () => {
      const { deleteOldTelemetry } = await import('../../convex/chat/telemetryMutations');

      const now = Date.now();
      const oneMinuteMs = 60 * 1000;
      const cutoffTimestamp = now - oneMinuteMs;

      // Mock query to return only recent telemetry records
      const recentTelemetry = {
        _id: 'recent123',
        createdAt: now, // Very recent
      };

      mockDb.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue([recentTelemetry]),
      });

      await deleteOldTelemetry(mockCtx, { cutoffTimestamp });

      // Verify delete was NOT called for recent records
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it('should return count of deleted records', async () => {
      const { deleteOldTelemetry } = await import('../../convex/chat/telemetryMutations');

      const now = Date.now();
      const cutoffTimestamp = now - (30 * 24 * 60 * 60 * 1000);

      // Mock multiple old records
      const oldRecords = [
        { _id: 'old1', createdAt: now - 40 * 24 * 60 * 60 * 1000 },
        { _id: 'old2', createdAt: now - 35 * 24 * 60 * 60 * 1000 },
        { _id: 'old3', createdAt: now - 31 * 24 * 60 * 60 * 1000 },
      ];

      mockDb.query.mockReturnValue({
        withIndex: vi.fn().mockReturnThis(),
        filter: vi.fn().mockReturnThis(),
        collect: vi.fn().mockResolvedValue(oldRecords),
      });

      mockDb.delete.mockResolvedValue(undefined);

      const result = await deleteOldTelemetry(mockCtx, { cutoffTimestamp });

      // Should return count of deleted records
      expect(result).toBe(3);
      expect(mockDb.delete).toHaveBeenCalledTimes(3);
    });
  });
});
