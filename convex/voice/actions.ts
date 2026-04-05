"use node";

import { action } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { getToolDefinitions } from "../../lib/voice/tool-definitions";

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
 * 1. Parallel: check for existing active session + build voice instructions
 * 2. If stale session found, end it (rare path — sequential)
 * 3. Parallel: POST to /v1/realtime/client_secrets (with full session config) + create session record
 * 4. Return {ephemeralKey, expiresAt, sessionId, instructions}
 *
 * Session config (instructions, tools, turn_detection, etc.) is sent in the
 * client_secrets POST body so the realtime connection is pre-configured —
 * no session.update round-trip needed after connecting.
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
  // 1. Validate API key is present before doing any DB work
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it in the Convex environment variables."
    );
  }

  // 2. Parallel: check for stale session AND build voice instructions simultaneously
  const activeSessionRef =
    overrides?.activeSessionQuery ?? api.voice.queries.getActiveSession;
  const buildInstructionsQueryRef =
    overrides?.buildInstructionsQuery ??
    internal.voice.context.buildVoiceInstructions;

  const [activeSession, instructions] = await Promise.all([
    ctx.runQuery(activeSessionRef, {
      conversationId: args.conversationId,
    }),
    ctx.runQuery(buildInstructionsQueryRef, {
      conversationId: args.conversationId,
    }),
  ]);

  // 3. End stale session if one exists (rare path — sequential, not worth parallelizing)
  if (activeSession) {
    const endSessionRef =
      overrides?.endSessionMutation ??
      internal.voice.mutations.internalEndSession;
    await ctx.runMutation(endSessionRef, {
      sessionId: (activeSession as { _id: string })._id,
    });
  }

  // 4. POST to OpenAI with full session config in the body.
  //    Full session config pre-configures the realtime connection,
  //    eliminating the session.update round-trip after WebRTC connect.
  console.time("openai-client-secrets-fetch");
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
        instructions: instructions as string,
        tools: getToolDefinitions(),
        tool_choice: "auto",
        audio: {
          input: {
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              idle_timeout_ms: 30000,
            },
            transcription: { model: "gpt-4o-transcribe" },
          },
          output: {
            voice: "cedar",
          },
        },
        truncation: { type: "retention_ratio", retention_ratio: 0.8 },
      },
    }),
  });
  console.timeEnd("openai-client-secrets-fetch");

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

  // 5. Create session record in DB (only after OpenAI confirms success)
  const startedAt = Date.now();
  const createSessionMutationRef =
    overrides?.createSessionMutation ??
    internal.voice.mutations.internalCreateSession;

  const sessionId = await ctx.runMutation(createSessionMutationRef, {
    conversationId: args.conversationId,
    startedAt,
  });

  // 6. Return ephemeral token + session metadata + instructions to client
  //    instructions is kept in the return value for warm-path reactivation
  return {
    ephemeralKey,
    expiresAt,
    sessionId: sessionId as string,
    instructions: instructions as string,
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
