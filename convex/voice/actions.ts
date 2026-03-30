"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";

import type { FunctionReference } from "convex/server";

const OPENAI_REALTIME_SESSIONS_URL =
  "https://api.openai.com/v1/realtime/client_secrets";

type CreateSessionCtx = {
  runQuery: (
    ref: FunctionReference<"query", "public" | "internal">,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  runMutation: (
    ref: FunctionReference<"mutation", "public" | "internal">,
    args: Record<string, unknown>
  ) => Promise<unknown>;
};

/**
 * Pure handler for createSession — extracted for unit testability.
 *
 * Steps:
 * 1. Check for existing active session
 * 2. Validate OPENAI_API_KEY
 * 3. POST to /v1/realtime/client_secrets
 * 4. Create session record via internal mutation
 * 5. Build dynamic voice instructions for the conversation
 * 6. Return {ephemeralKey, expiresAt, sessionId, instructions}
 *
 * NEVER stores the ephemeral key in the database.
 * NEVER exposes OPENAI_API_KEY to the client.
 */
export const createSessionHandler = async (
  ctx: CreateSessionCtx,
  args: { conversationId: string },
  overrides?: {
    activeSessionQuery?: FunctionReference<"query", "public" | "internal">;
    endSessionMutation?: FunctionReference<"mutation", "public" | "internal">;
    createSessionMutation?: FunctionReference<"mutation", "public" | "internal">;
    buildInstructionsQuery?: FunctionReference<"query", "public" | "internal">;
  }
): Promise<{
  ephemeralKey: string;
  expiresAt: number;
  sessionId: string;
  instructions: string;
}> => {
  // 1. Check for active session — auto-end stale sessions instead of blocking
  const activeSessionRef =
    overrides?.activeSessionQuery ?? api.voice.queries.getActiveSession;
  const activeSession = await ctx.runQuery(activeSessionRef, {
    conversationId: args.conversationId,
  });

  if (activeSession) {
    // Auto-end stale session instead of blocking new session creation
    const endSessionRef =
      overrides?.endSessionMutation ??
      internal.voice.mutations.internalEndSession;
    await ctx.runMutation(endSessionRef, {
      sessionId: (activeSession as { _id: string })._id,
    });
  }

  // 2. Validate API key is present
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it in the Convex environment variables."
    );
  }

  // 3. Generate ephemeral token from OpenAI Realtime API
  const response = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime",
        audio: { output: { voice: "cedar" } },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI API returned status ${response.status}: ${errorText}`
    );
  }

  const tokenData = (await response.json()) as {
    value: string;
    expires_at: number;
  };

  const ephemeralKey = tokenData.value;
  const expiresAt = tokenData.expires_at;

  // 4. Create session record via internal mutation (does NOT store the ephemeral key)
  const startedAt = Date.now();
  const createSessionMutationRef =
    overrides?.createSessionMutation ??
    internal.voice.mutations.internalCreateSession;

  const sessionId = (await ctx.runMutation(createSessionMutationRef, {
    conversationId: args.conversationId,
    startedAt,
  })) as string;

  // 5. Build dynamic voice instructions for the conversation
  const buildInstructionsQueryRef =
    overrides?.buildInstructionsQuery ??
    internal.voice.context.buildVoiceInstructions;
  const instructions = (await ctx.runQuery(buildInstructionsQueryRef, {
    conversationId: args.conversationId,
  })) as string;

  // 6. Return ephemeral token + session metadata + instructions to client
  return {
    ephemeralKey,
    expiresAt,
    sessionId,
    instructions,
  };
};

/**
 * Creates a voice session by generating an OpenAI Realtime ephemeral token.
 * Registered as a Convex action for client use.
 */
export const createSession = action({
  args: {
    conversationId: v.id("conversations"),
  },
  returns: v.object({
    ephemeralKey: v.string(),
    expiresAt: v.number(),
    sessionId: v.id("voiceSessions"),
    instructions: v.string(),
  }),
  handler: async (ctx, args) => {
    return createSessionHandler(ctx, args) as ReturnType<
      typeof createSessionHandler
    > as Promise<{
      ephemeralKey: string;
      expiresAt: number;
      sessionId: string & { __tableName: "voiceSessions" };
      instructions: string;
    }>;
  },
});
