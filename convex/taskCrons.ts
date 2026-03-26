import { internalAction, internalQuery, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Task Timeout Cron Job Handler
 *
 * This replaces the Supabase task-timeout-worker Edge Function.
 * Marks tasks as errored if they've been running longer than the timeout threshold.
 *
 * @see supabase/functions/task-timeout-worker/index.ts (old implementation)
 * @see US-054 - Task Management Migration to Convex
 */

/**
 * Timeout stuck tasks
 *
 * Finds all tasks in "running" status that have exceeded the timeout threshold
 * and marks them as errored.
 *
 * @param timeoutMinutes - Tasks running longer than this are marked as errored (default: 60)
 * @returns Object with count of timed out tasks
 */
export const timeoutStuckTasks = internalAction({
  args: {
    timeoutMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const timeoutMinutes = args.timeoutMinutes ?? 60;
    const timeoutMs = timeoutMinutes * 60 * 1000;
    const now = Date.now();
    const cutoffTime = now - timeoutMs;

    // Get all running tasks
    const runningTasks = await ctx.runQuery(internal.taskCrons.getRunningTasks);
    if (runningTasks.length === 0) return { timed_out_count: 0, timeout_minutes: timeoutMinutes };

    // Filter to tasks that have exceeded the timeout
    const stuckTasks = runningTasks.filter((task: any) => {
      const startedAt = task.startedAt ?? task.createdAt;
      return startedAt < cutoffTime;
    });

    if (stuckTasks.length === 0) return { timed_out_count: 0, timeout_minutes: timeoutMinutes };

    // Mark each stuck task as errored
    let timedOutCount = 0;
    for (const task of stuckTasks) {
      try {
        const startedAt = task.startedAt ?? task.createdAt;
        const runningTime = Math.floor((now - startedAt) / 60000); // minutes

        console.log(`[task-timeout-worker] Timing out task ${task._id} (running for ${runningTime} minutes)`);

        await ctx.runMutation(internal.taskCrons.timeoutTask, {
          taskId: task._id,
          runningTime,
          timeoutMinutes,
        });

        timedOutCount++;
      } catch (error) {
        console.error(`[task-timeout-worker] Failed to timeout task ${task._id}:`, error);
      }
    }

    console.log(`[task-timeout-worker] Timed out ${timedOutCount} task(s)`);

    return {
      timed_out_count: timedOutCount,
      timeout_minutes: timeoutMinutes,
    };
  },
});

/**
 * Internal query to get all running tasks
 *
 * This is a separate query so it can be called from the action.
 */
export const getRunningTasks = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .collect();
  },
});

/**
 * Internal mutation to mark a task as timed out
 *
 * This is a separate mutation so it can be called from the action.
 */
export const timeoutTask = internalMutation({
  args: {
    taskId: v.id("tasks"),
    runningTime: v.number(),
    timeoutMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      status: "error",
      errorMessage: `Task timed out after running for ${args.runningTime} minutes (timeout: ${args.timeoutMinutes} minutes)`,
      errorDetails: {
        reason: "timeout",
        runningTime: args.runningTime,
        timeoutMinutes: args.timeoutMinutes,
        timedOutAt: Date.now(),
      },
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
