/**
 * Domain schema barrel — all ~55 tables across groups.
 */

export * from './analysis';
export * from './chat';
export * from './documents';
export * from './etl';
export * from './evals';
export * from './evidence';
export * from './inference';
export * from './media';
export * from './others';
export * from './outbox';
export * from './queue';
export * from './research';
export * from './subscriptions';
export * from './zero-pub';

import * as analysis from './analysis';
import * as chat from './chat';
import * as documents from './documents';
import * as etl from './etl';
import * as evals from './evals';
import * as evidence from './evidence';
import * as inference from './inference';
import * as media from './media';
import * as others from './others';
import * as outbox from './outbox';
import * as queue from './queue';
import * as research from './research';
import * as subscriptions from './subscriptions';

/** Flat schema object for drizzle() client. */
export const schema = {
  ...chat,
  ...documents,
  ...etl,
  ...research,
  ...analysis,
  ...subscriptions,
  ...media,
  ...evidence,
  ...others,
  ...outbox,
  ...queue,
  ...inference,
  ...evals,
};

/** Ordered list of expected physical table names (≥55). */
export const DOMAIN_TABLE_NAMES = [
  // chat (6)
  'conversations',
  'chat_messages',
  'tool_calls',
  'agent_plans',
  'agent_plan_steps',
  'agent_telemetry',
  // documents (3)
  'documents',
  'imports',
  'citations',
  // research (3)
  'research_sessions',
  'research_iterations',
  'research_findings',
  // analysis (3)
  'analysis_sessions',
  'analysis_items',
  'analysis_evidence',
  // subscriptions (7)
  'creator_profiles',
  'subscription_sources',
  'subscription_content',
  'subscription_filters',
  'subscription_links',
  'feed_items',
  'feed_sessions',
  // media (7)
  'file_objects',
  'audio_jobs',
  'audio_segments',
  'video_transcripts',
  'transcript_jobs',
  'audio_transcripts',
  'audio_transcript_jobs',
  // evidence (6)
  'sources',
  'passages',
  'claims',
  'entities',
  'relations',
  'beliefs',
  // others (22)
  'whats_new_reports',
  'whats_new_workflows',
  'toolbelt_tools',
  'shop_sessions',
  'shop_listings',
  'assimilation_metadata',
  'assimilation_sessions',
  'assimilation_iterations',
  'tasks',
  'execution_plans',
  'plan_approvals',
  'improvement_requests',
  'improvement_images',
  'voice_sessions',
  'voice_commands',
  'notifications',
  'user_preferences',
  'feed_settings',
  'app_settings',
  'rate_limit_tracking',
  'rate_limits',
  'convex_id_map',
] as const;

export const ANALYSIS_TRIO = ['analysis_sessions', 'analysis_items', 'analysis_evidence'] as const;

export const RESEARCH_TRIO = [
  'research_sessions',
  'research_iterations',
  'research_findings',
] as const;

export const FORBIDDEN_SHELL_TABLES = [
  'revenue_validation_sessions',
  'competitive_analysis_sessions',
  'ai_roi_sessions',
  'flights_sessions',
  'deep_research_sessions',
  'deep_research_iterations',
  'revenue_validation_competitors',
  'revenue_validation_evidence',
  'competitive_analysis_competitors',
  'competitive_analysis_features',
  'ai_roi_opportunities',
  'ai_roi_evidence',
  'flights_routes',
  'flights_price_calendar',
] as const;
