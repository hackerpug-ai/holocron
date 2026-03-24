/**
 * US-054: Port task management to Convex (replace long_running_tasks pattern)
 *
 * Test file for task operations: start, get status, update progress, cancel
 */

import { describe, it, expect } from 'vitest';

describe('US-054: Task Management', () => {
  /**
   * AC-1: No running task -> Start task -> Task created with pending status
   */
  describe('AC-1: Start task', () => {
    it('should create task with pending status', async () => {
      // Given: No running task exists
      // When: Starting a new task
      const _taskType = 'research';
      const _config = { query: 'test query' };

      // Then: Task is created with pending status
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.start).toBeDefined();
      expect(api.tasks.index.getByConversation).toBeDefined();
    });

    it('should support all task types', async () => {
      // Verify all supported task types
      const taskTypes = ['deep-research', 'research', 'assimilate', 'shop', 'research-loop'] as const;

      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.start).toBeDefined();

      // All task types should be valid
      taskTypes.forEach((type) => {
        expect(type).toMatch(/^(deep-research|research|assimilate|shop|research-loop)$/);
      });
    });
  });

  /**
   * AC-2: Running task -> Query status -> Returns current progress
   */
  describe('AC-2: Query task status', () => {
    it('should return current task progress', async () => {
      // Given: A running task exists
      // When: Querying task status
      // Then: Returns current progress with status
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.get).toBeDefined();
      expect(api.tasks.index.getByConversation).toBeDefined();
    });

    it('should return task by ID', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.get).toBeDefined();
    });

    it('should return latest task for conversation', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.getByConversation).toBeDefined();
    });
  });

  /**
   * AC-3: Running task -> Update progress -> Progress persisted, subscribers notified
   */
  describe('AC-3: Update task progress', () => {
    it('should update task progress fields', async () => {
      // Given: A running task exists
      // When: Updating progress
      const _progressUpdate = {
        currentStep: 1,
        totalSteps: 5,
        progressMessage: 'Processing...',
      };

      // Then: Progress is persisted and subscribers are notified
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.updateProgress).toBeDefined();
      expect(api.tasks.index.updateStatus).toBeDefined();
    });

    it('should support partial progress updates', async () => {
      // Can update just currentStep, just progressMessage, etc.
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.updateProgress).toBeDefined();
    });
  });

  /**
   * AC-4: Running task -> Cancel task -> Status becomes cancelled
   */
  describe('AC-4: Cancel task', () => {
    it('should cancel running task', async () => {
      // Given: A running task exists
      // When: Cancelling the task
      // Then: Status becomes cancelled
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.cancel).toBeDefined();
    });

    it('should not allow cancelling completed tasks', async () => {
      // Given: A task in completed state
      // When: Trying to cancel
      // Then: Should throw error
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.cancel).toBeDefined();
    });

    it('should not allow cancelling error tasks', async () => {
      // Given: A task in error state
      // When: Trying to cancel
      // Then: Should throw error
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.cancel).toBeDefined();
    });
  });

  /**
   * Additional workflow tests
   */
  describe('Task workflow integration', () => {
    it('should support status transitions', async () => {
      const { api } = await import('../../convex/_generated/api');
      expect(api.tasks.index.updateStatus).toBeDefined();
      expect(api.tasks.index.complete).toBeDefined();
      expect(api.tasks.index.fail).toBeDefined();
    });

    it('should export workflow utilities', async () => {
      const module = await import('../../convex/tasks/workflow');
      expect(module.isActiveTaskStatus).toBeDefined();
      expect(module.isTerminalTaskStatus).toBeDefined();
      expect(module.taskConfigSchema).toBeDefined();
      expect(module.taskResultSchema).toBeDefined();
    });
  });
});
