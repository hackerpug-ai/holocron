/**
 * chat group — conversations, chat_messages, tool_calls, agent_plans, agent_plan_steps, agent_telemetry
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';
import {
  createdAtColumn,
  idColumn,
  legacyConvexIdColumn,
  legacyConvexIdIndex,
  timestamptz,
  typedJsonb,
  updatedAtColumn,
} from '../columns';
import { sqlInList, workStatusValues } from '../enums';

export const conversations = pgTable(
  'conversations',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    title: text('title'),
    titleSetByUser: boolean('title_set_by_user').default(false),
    lastMessagePreview: text('last_message_preview'),
    agentBusy: boolean('agent_busy').default(false),
    agentBusySince: timestamptz('agent_busy_since'),
    pendingIntent: text('pending_intent'),
    pendingQueryShape: typedJsonb('pending_query_shape'),
    pendingSince: timestamptz('pending_since'),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
  },
  (t) => [legacyConvexIdIndex('conversations', t.legacyConvexId)]
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: uuidRef('conversation_id'),
    role: text('role').notNull(),
    content: text('content'),
    messageType: text('message_type'),
    /** Polymorphic card payload — typed jsonb (AC-2 probe target). */
    cardData: typedJsonb<Record<string, unknown>>('card_data'),
    sessionId: text('session_id'),
    voiceSessionId: text('voice_session_id'),
    documentId: text('document_id'),
    deleted: boolean('deleted').default(false),
    toolCallId: text('tool_call_id'),
    reasoning: text('reasoning'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('chat_messages', t.legacyConvexId),
    index('chat_messages_conversation_id_idx').on(t.conversationId),
  ]
);

export const toolCalls = pgTable(
  'tool_calls',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: uuidRef('conversation_id'),
    messageId: text('message_id'),
    toolName: text('tool_name').notNull(),
    toolDisplayName: text('tool_display_name'),
    toolArgs: typedJsonb('tool_args'),
    reasoning: text('reasoning'),
    status: text('status').notNull().default('pending'),
    resultMessageId: text('result_message_id'),
    error: text('error'),
    createdAt: createdAtColumn(),
    resolvedAt: timestamptz('resolved_at'),
  },
  (t) => [
    legacyConvexIdIndex('tool_calls', t.legacyConvexId),
    check('tool_calls_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const agentPlans = pgTable(
  'agent_plans',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: uuidRef('conversation_id'),
    messageId: text('message_id'),
    title: text('title'),
    status: text('status').notNull().default('pending'),
    currentStepIndex: integer('current_step_index').default(0),
    totalSteps: integer('total_steps').default(0),
    createdAt: createdAtColumn(),
    updatedAt: updatedAtColumn(),
    completedAt: timestamptz('completed_at'),
  },
  (t) => [
    legacyConvexIdIndex('agent_plans', t.legacyConvexId),
    check('agent_plans_status_check', sql`status IN (${sql.raw(sqlInList(workStatusValues))})`),
  ]
);

export const agentPlanSteps = pgTable(
  'agent_plan_steps',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    planId: uuidRef('plan_id'),
    stepIndex: integer('step_index').notNull().default(0),
    toolName: text('tool_name'),
    toolDisplayName: text('tool_display_name'),
    toolArgs: typedJsonb('tool_args'),
    description: text('description'),
    requiresApproval: boolean('requires_approval').default(false),
    status: text('status').notNull().default('pending'),
    toolCallId: text('tool_call_id'),
    resultSummary: text('result_summary'),
    errorMessage: text('error_message'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    createdAt: createdAtColumn(),
  },
  (t) => [
    legacyConvexIdIndex('agent_plan_steps', t.legacyConvexId),
    check(
      'agent_plan_steps_status_check',
      sql`status IN (${sql.raw(sqlInList(workStatusValues))})`
    ),
  ]
);

export const agentTelemetry = pgTable(
  'agent_telemetry',
  {
    id: idColumn(),
    legacyConvexId: legacyConvexIdColumn(),
    conversationId: uuidRef('conversation_id'),
    messageId: text('message_id'),
    intent: text('intent'),
    queryShape: typedJsonb('query_shape'),
    confidence: doublePrecision('confidence'),
    reasoning: text('reasoning'),
    classificationSource: text('classification_source'),
    regexMatchPattern: text('regex_match_pattern'),
    rawLlmResponse: text('raw_llm_response'),
    llmDurationMs: integer('llm_duration_ms'),
    specialistUsed: text('specialist_used'),
    toolsCalled: typedJsonb('tools_called'),
    ambiguousIntents: typedJsonb('ambiguous_intents'),
    clarificationQuestion: text('clarification_question'),
    totalDurationMs: integer('total_duration_ms'),
    createdAt: createdAtColumn(),
  },
  (t) => [legacyConvexIdIndex('agent_telemetry', t.legacyConvexId)]
);

function uuidRef(name: string) {
  return text(name);
}
