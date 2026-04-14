/**
 * Telemetry Mutations Tests
 *
 * TDD: RED -> GREEN -> REFACTOR
 * Tests for deleteOldTelemetry: 90-day TTL retention cleanup with batching.
 */

import { describe, it, expect } from "vitest";
import { computeCutoff, BATCH_SIZE, deleteOldTelemetryCore } from "./telemetryMutations";

/**
 * Creates a mock Convex context that simulates the agentTelemetry query chain.
 * The mock captures the cutoff from the withIndex callback and filters rows.
 */
function createMockCtx(
  rows: Array<{ _id: string; createdAt: number; [key: string]: any }>,
  deletedIds: string[],
  batchSizes: number[],
) {
  return {
    db: {
      query: (_table: string) => {
        let capturedCutoff = 0;

        return {
          withIndex: (_name: string, fn: (q: any) => any) => {
            // The real Convex q.lt returns a query builder; our mock captures the value
            const q = {
              lt: (_field: string, val: number) => {
                capturedCutoff = val;
                return {}; // return truthy to satisfy chaining
              },
            };
            fn(q); // invoke callback to capture cutoff
            return {
              take: (n: number) => {
                const remaining = rows.filter(
                  (r) => r.createdAt < capturedCutoff && !deletedIds.includes(r._id),
                );
                const batch = remaining.slice(0, n);
                batchSizes.push(batch.length);
                return batch;
              },
            };
          },
        };
      },
      delete: async (id: any) => {
        deletedIds.push(id as string);
      },
    },
  } as any;
}

describe("deleteOldTelemetry", () => {
  describe("AC-1: deleteOldTelemetry removes only 90+ day rows", () => {
    it("deleteOldTelemetry 90 day cutoff deletes only old rows", async () => {
      const NOW = 1_700_000_000_000; // fixed "now" for deterministic tests
      const DAY_MS = 24 * 60 * 60 * 1000;

      // 10 rows spanning 180 days, one per 20 days
      // Row 0: 180 days old, Row 1: 160 days old, ..., Row 9: 0 days old
      const rows = Array.from({ length: 10 }, (_, i) => ({
        _id: `id_${i}`,
        createdAt: NOW - (180 - i * 20) * DAY_MS,
        conversationId: `conv_${i}`,
        messageId: `msg_${i}`,
        intent: "test",
        queryShape: "factual",
        confidence: "high",
        classificationSource: "regex" as const,
        totalDurationMs: 100,
      }));

      // Cutoff = NOW - 90 days
      // Rows with createdAt < cutoff are deleted
      // Row 0: NOW - 180d < cutoff? YES (180 > 90)
      // Row 1: NOW - 160d < cutoff? YES (160 > 90)
      // Row 2: NOW - 140d < cutoff? YES (140 > 90)
      // Row 3: NOW - 120d < cutoff? YES (120 > 90)
      // Row 4: NOW - 100d < cutoff? YES (100 > 90)
      // Row 5: NOW - 80d  < cutoff? NO  (80 < 90)
      // Row 6: NOW - 60d  < cutoff? NO
      // Row 7: NOW - 40d  < cutoff? NO
      // Row 8: NOW - 20d  < cutoff? NO
      // Row 9: NOW - 0d   < cutoff? NO

      const deletedIds: string[] = [];
      const batchSizes: number[] = [];
      const mockCtx = createMockCtx(rows, deletedIds, batchSizes);

      const ninetyDaysMs = 90 * DAY_MS;
      const result = await deleteOldTelemetryCore(mockCtx, ninetyDaysMs, NOW);

      // Should delete rows 0-4 (those older than 90 days)
      expect(deletedIds.length).toBe(5);
      expect(deletedIds).toContain("id_0");
      expect(deletedIds).toContain("id_1");
      expect(deletedIds).toContain("id_2");
      expect(deletedIds).toContain("id_3");
      expect(deletedIds).toContain("id_4");
      // Should NOT delete rows 5-9 (those 80 days or newer)
      expect(deletedIds).not.toContain("id_5");
      expect(deletedIds).not.toContain("id_6");
      expect(deletedIds).not.toContain("id_7");
      expect(deletedIds).not.toContain("id_8");
      expect(deletedIds).not.toContain("id_9");

      expect(result.deleted).toBe(5);
    });
  });

  describe("AC-3: Batch deletes don't exceed transaction limits", () => {
    it("batches deletes in groups of at most 1000", async () => {
      const NOW = 1_700_000_000_000;
      const DAY_MS = 24 * 60 * 60 * 1000;

      // 5000 rows all older than 90 days
      const rows = Array.from({ length: 5000 }, (_, i) => ({
        _id: `id_${i}`,
        createdAt: NOW - 100 * DAY_MS, // all 100 days old
        conversationId: `conv_${i}`,
        messageId: `msg_${i}`,
        intent: "test",
        queryShape: "factual",
        confidence: "high",
        classificationSource: "regex" as const,
        totalDurationMs: 100,
      }));

      const deletedIds: string[] = [];
      const batchSizes: number[] = [];
      const mockCtx = createMockCtx(rows, deletedIds, batchSizes);

      const ninetyDaysMs = 90 * DAY_MS;
      const result = await deleteOldTelemetryCore(mockCtx, ninetyDaysMs, NOW);

      // All 5000 should be deleted
      expect(result.deleted).toBe(5000);
      expect(deletedIds.length).toBe(5000);

      // Every batch should be at most BATCH_SIZE
      for (const size of batchSizes) {
        expect(size).toBeLessThanOrEqual(BATCH_SIZE);
      }

      // Should have taken multiple batches (5000 / 1000 = 5)
      expect(batchSizes.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe("computeCutoff helper", () => {
    it("computes correct cutoff from olderThanMs", () => {
      const NOW = 1_700_000_000_000;
      const DAY_MS = 24 * 60 * 60 * 1000;
      const cutoff = computeCutoff(90 * DAY_MS, NOW);
      expect(cutoff).toBe(NOW - 90 * DAY_MS);
    });
  });
});
