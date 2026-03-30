import { internalMutation, mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation to create a voiceSession record.
 * Called from the createSession action after obtaining the ephemeral token.
 * NEVER stores the ephemeral key — only session metadata.
 */
export const internalCreateSession = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    startedAt: v.number(),
  },
  returns: v.id("voiceSessions"),
  handler: async (ctx, args) => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("voiceSessions", {
      conversationId: args.conversationId,
      startedAt: args.startedAt,
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

/**
 * End an active voice session.
 * Calculates totalDurationMs from startedAt to now and sets completedAt.
 * Throws if the session has already been completed.
 */
export const endSession = mutation({
  args: { sessionId: v.id("voiceSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.completedAt) throw new Error("Session already ended");
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      completedAt: now,
      totalDurationMs: now - session.startedAt,
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Record a voice transcript turn into the existing chatMessages table.
 * Increments turnCount on the voiceSession.
 */
export const recordTranscript = mutation({
  args: {
    sessionId: v.id("voiceSessions"),
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("agent")),
    content: v.string(),
  },
  returns: v.id("chatMessages"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const now = Date.now();

    const messageId = await ctx.db.insert("chatMessages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      messageType: "text",
      voiceSessionId: args.sessionId,
      createdAt: now,
    });

    await ctx.db.patch(args.sessionId, {
      turnCount: session.turnCount + 1,
      updatedAt: now,
    });

    return messageId;
  },
});

/**
 * Record a voice command execution for audit trail.
 * Supports both successful and failed command executions.
 */
export const recordCommand = mutation({
  args: {
    sessionId: v.id("voiceSessions"),
    transcript: v.string(),
    intent: v.string(),
    actionType: v.string(),
    success: v.boolean(),
    entities: v.optional(
      v.array(
        v.object({
          type: v.string(),
          value: v.string(),
          confidence: v.number(),
        })
      )
    ),
    actionParams: v.optional(v.record(v.string(), v.string())),
    result: v.optional(
      v.object({
        success: v.boolean(),
        data: v.optional(v.any()),
        error: v.optional(v.string()),
      })
    ),
  },
  returns: v.id("voiceCommands"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const now = Date.now();

    const commandId = await ctx.db.insert("voiceCommands", {
      sessionId: args.sessionId,
      transcript: args.transcript,
      intent: args.intent,
      actionType: args.actionType,
      success: args.success,
      entities: args.entities ?? [],
      actionParams: args.actionParams,
      result: args.result,
      createdAt: now,
      updatedAt: now,
    });

    return commandId;
  },
});

/**
 * Internal mutation to idempotently end a voice session.
 * Called from createSessionHandler to auto-end stale/orphaned sessions
 * that block new session creation.
 * Safe to call on an already-completed session — returns null without patching.
 */
export const internalEndSession = internalMutation({
  args: { sessionId: v.id("voiceSessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.completedAt) return null;
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      completedAt: now,
      totalDurationMs: now - session.startedAt,
      errorMessage: "Replaced by new session",
      updatedAt: now,
    });
    return null;
  },
});

/**
 * Set the user's preferred voice language.
 * Creates or updates the userPreferences singleton.
 */
export const setVoiceLanguage = mutation({
  args: { language: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const prefs = await ctx.db.query("userPreferences").first();
    const now = Date.now();
    if (prefs) {
      await ctx.db.patch(prefs._id, { voiceLanguage: args.language, updatedAt: now });
    } else {
      await ctx.db.insert("userPreferences", { voiceLanguage: args.language, updatedAt: now });
    }
    return null;
  },
});
