/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentPlans_actions from "../agentPlans/actions.js";
import type * as agentPlans_mutations from "../agentPlans/mutations.js";
import type * as agentPlans_queries from "../agentPlans/queries.js";
import type * as agentPlans_scheduled from "../agentPlans/scheduled.js";
import type * as agentPlans_toolConfig from "../agentPlans/toolConfig.js";
import type * as assimilate_index from "../assimilate/index.js";
import type * as assimilate_mutations from "../assimilate/mutations.js";
import type * as assimilate_prompts from "../assimilate/prompts.js";
import type * as assimilate_queries from "../assimilate/queries.js";
import type * as assimilate_scheduled from "../assimilate/scheduled.js";
import type * as assimilate_termination from "../assimilate/termination.js";
import type * as assimilate_validators from "../assimilate/validators.js";
import type * as audio_actions from "../audio/actions.js";
import type * as audio_mutations from "../audio/mutations.js";
import type * as audio_queries from "../audio/queries.js";
import type * as audio_scheduled from "../audio/scheduled.js";
import type * as chat_agent from "../chat/agent.js";
import type * as chat_agentMutations from "../chat/agentMutations.js";
import type * as chat_context from "../chat/context.js";
import type * as chat_index from "../chat/index.js";
import type * as chat_prompts from "../chat/prompts.js";
import type * as chat_specialistPrompts from "../chat/specialistPrompts.js";
import type * as chat_specialists from "../chat/specialists.js";
import type * as chat_toolActions from "../chat/toolActions.js";
import type * as chat_toolExecutor from "../chat/toolExecutor.js";
import type * as chat_tools from "../chat/tools.js";
import type * as chat_triage from "../chat/triage.js";
import type * as chatMessages_index from "../chatMessages/index.js";
import type * as chatMessages_mutations from "../chatMessages/mutations.js";
import type * as chatMessages_queries from "../chatMessages/queries.js";
import type * as citations_mutations from "../citations/mutations.js";
import type * as citations_queries from "../citations/queries.js";
import type * as conversations_index from "../conversations/index.js";
import type * as conversations_mutations from "../conversations/mutations.js";
import type * as conversations_queries from "../conversations/queries.js";
import type * as creators_actions from "../creators/actions.js";
import type * as creators_index from "../creators/index.js";
import type * as creators_internal from "../creators/internal.js";
import type * as creators_mutations from "../creators/mutations.js";
import type * as creators_queries from "../creators/queries.js";
import type * as creators_validators from "../creators/validators.js";
import type * as crons from "../crons.js";
import type * as deepResearchIterations_mutations from "../deepResearchIterations/mutations.js";
import type * as deepResearchIterations_queries from "../deepResearchIterations/queries.js";
import type * as deepResearchSessions_mutations from "../deepResearchSessions/mutations.js";
import type * as deepResearchSessions_queries from "../deepResearchSessions/queries.js";
import type * as documents_index from "../documents/index.js";
import type * as documents_mutations from "../documents/mutations.js";
import type * as documents_queries from "../documents/queries.js";
import type * as documents_scheduled from "../documents/scheduled.js";
import type * as documents_search from "../documents/search.js";
import type * as documents_storage from "../documents/storage.js";
import type * as feeds_actions from "../feeds/actions.js";
import type * as feeds_index from "../feeds/index.js";
import type * as feeds_internal from "../feeds/internal.js";
import type * as feeds_mutations from "../feeds/mutations.js";
import type * as feeds_queries from "../feeds/queries.js";
import type * as feeds_validators from "../feeds/validators.js";
import type * as http from "../http.js";
import type * as imports_mutations from "../imports/mutations.js";
import type * as improvements_actions from "../improvements/actions.js";
import type * as improvements_internal from "../improvements/internal.js";
import type * as improvements_mutations from "../improvements/mutations.js";
import type * as improvements_prompts from "../improvements/prompts.js";
import type * as improvements_queries from "../improvements/queries.js";
import type * as improvements_search from "../improvements/search.js";
import type * as lib_ai_embeddings_provider from "../lib/ai/embeddings_provider.js";
import type * as lib_ai_zai_provider from "../lib/ai/zai_provider.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_json from "../lib/json.js";
import type * as lib_strings from "../lib/strings.js";
import type * as migrations_backfill_chat_titles from "../migrations/backfill_chat_titles.js";
import type * as migrations_backfill_infeed from "../migrations/backfill_infeed.js";
import type * as migrations_backfill_missing_embeddings from "../migrations/backfill_missing_embeddings.js";
import type * as migrations_backfill_research_documents from "../migrations/backfill_research_documents.js";
import type * as migrations_cleanup_irrelevant_twitter from "../migrations/cleanup_irrelevant_twitter.js";
import type * as migrations_cleanup_irrelevant_twitter_actions from "../migrations/cleanup_irrelevant_twitter_actions.js";
import type * as migrations_reembed_documents_1024 from "../migrations/reembed_documents_1024.js";
import type * as migrations_refactor_deep_research_messages from "../migrations/refactor_deep_research_messages.js";
import type * as migrations_remove_twitter_content from "../migrations/remove_twitter_content.js";
import type * as migrations_strip_platform_prefix from "../migrations/strip_platform_prefix.js";
import type * as notifications_index from "../notifications/index.js";
import type * as notifications_internal from "../notifications/internal.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as plans_confirmation from "../plans/confirmation.js";
import type * as plans_generator from "../plans/generator.js";
import type * as plans_index from "../plans/index.js";
import type * as plans_mutations from "../plans/mutations.js";
import type * as plans_queries from "../plans/queries.js";
import type * as rateLimits_index from "../rateLimits/index.js";
import type * as rateLimits_mutations from "../rateLimits/mutations.js";
import type * as rateLimits_queries from "../rateLimits/queries.js";
import type * as research_actions from "../research/actions.js";
import type * as research_confidence from "../research/confidence.js";
import type * as research_context from "../research/context.js";
import type * as research_dispatcher from "../research/dispatcher.js";
import type * as research_documentQueries from "../research/documentQueries.js";
import type * as research_documents from "../research/documents.js";
import type * as research_embeddings from "../research/embeddings.js";
import type * as research_index from "../research/index.js";
import type * as research_intent from "../research/intent.js";
import type * as research_mode_prompts from "../research/mode_prompts.js";
import type * as research_mutations from "../research/mutations.js";
import type * as research_output from "../research/output.js";
import type * as research_parallel from "../research/parallel.js";
import type * as research_parallel_iteration from "../research/parallel_iteration.js";
import type * as research_prompts from "../research/prompts.js";
import type * as research_queries from "../research/queries.js";
import type * as research_rateLimiter from "../research/rateLimiter.js";
import type * as research_scheduled from "../research/scheduled.js";
import type * as research_search from "../research/search.js";
import type * as research_specialists_academic from "../research/specialists/academic.js";
import type * as research_specialists_index from "../research/specialists/index.js";
import type * as research_specialists_product_finder from "../research/specialists/product_finder.js";
import type * as research_specialists_service_finder from "../research/specialists/service_finder.js";
import type * as research_specialists_technical from "../research/specialists/technical.js";
import type * as research_termination from "../research/termination.js";
import type * as research_tools from "../research/tools.js";
import type * as researchIterations_mutations from "../researchIterations/mutations.js";
import type * as researchIterations_queries from "../researchIterations/queries.js";
import type * as researchSessions_mutations from "../researchSessions/mutations.js";
import type * as researchSessions_queries from "../researchSessions/queries.js";
import type * as shop_dispatcher from "../shop/dispatcher.js";
import type * as shop_index from "../shop/index.js";
import type * as shop_mutations from "../shop/mutations.js";
import type * as shop_queries from "../shop/queries.js";
import type * as shop_search from "../shop/search.js";
import type * as subscriptions_actions from "../subscriptions/actions.js";
import type * as subscriptions_ai_scoring from "../subscriptions/ai_scoring.js";
import type * as subscriptions_deduplication from "../subscriptions/deduplication.js";
import type * as subscriptions_deduplication_helpers from "../subscriptions/deduplication_helpers.js";
import type * as subscriptions_feedback from "../subscriptions/feedback.js";
import type * as subscriptions_index from "../subscriptions/index.js";
import type * as subscriptions_internal from "../subscriptions/internal.js";
import type * as subscriptions_links from "../subscriptions/links.js";
import type * as subscriptions_mutations from "../subscriptions/mutations.js";
import type * as subscriptions_queries from "../subscriptions/queries.js";
import type * as synthesis_rateLimits from "../synthesis/rateLimits.js";
import type * as taskCrons from "../taskCrons.js";
import type * as tasks_index from "../tasks/index.js";
import type * as tasks_mutations from "../tasks/mutations.js";
import type * as tasks_queries from "../tasks/queries.js";
import type * as tasks_workflow from "../tasks/workflow.js";
import type * as toolCalls_mutations from "../toolCalls/mutations.js";
import type * as toolCalls_queries from "../toolCalls/queries.js";
import type * as toolCalls_scheduled from "../toolCalls/scheduled.js";
import type * as toolbelt_index from "../toolbelt/index.js";
import type * as toolbelt_mutations from "../toolbelt/mutations.js";
import type * as toolbelt_queries from "../toolbelt/queries.js";
import type * as toolbelt_search from "../toolbelt/search.js";
import type * as toolbelt_storage from "../toolbelt/storage.js";
import type * as transcripts_index from "../transcripts/index.js";
import type * as transcripts_internal from "../transcripts/internal.js";
import type * as transcripts_mutations from "../transcripts/mutations.js";
import type * as transcripts_nodeTranscript from "../transcripts/nodeTranscript.js";
import type * as transcripts_oauth from "../transcripts/oauth.js";
import type * as transcripts_queries from "../transcripts/queries.js";
import type * as transcripts_scheduled from "../transcripts/scheduled.js";
import type * as transcripts_service from "../transcripts/service.js";
import type * as voice_actions from "../voice/actions.js";
import type * as voice_context from "../voice/context.js";
import type * as voice_executeTool from "../voice/executeTool.js";
import type * as voice_mutations from "../voice/mutations.js";
import type * as voice_queries from "../voice/queries.js";
import type * as voice_scheduled from "../voice/scheduled.js";
import type * as whatsNew from "../whatsNew.js";
import type * as whatsNew_actions from "../whatsNew/actions.js";
import type * as whatsNew_config from "../whatsNew/config.js";
import type * as whatsNew_index from "../whatsNew/index.js";
import type * as whatsNew_internal from "../whatsNew/internal.js";
import type * as whatsNew_llm from "../whatsNew/llm.js";
import type * as whatsNew_mutations from "../whatsNew/mutations.js";
import type * as whatsNew_quality from "../whatsNew/quality.js";
import type * as whatsNew_queries from "../whatsNew/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agentPlans/actions": typeof agentPlans_actions;
  "agentPlans/mutations": typeof agentPlans_mutations;
  "agentPlans/queries": typeof agentPlans_queries;
  "agentPlans/scheduled": typeof agentPlans_scheduled;
  "agentPlans/toolConfig": typeof agentPlans_toolConfig;
  "assimilate/index": typeof assimilate_index;
  "assimilate/mutations": typeof assimilate_mutations;
  "assimilate/prompts": typeof assimilate_prompts;
  "assimilate/queries": typeof assimilate_queries;
  "assimilate/scheduled": typeof assimilate_scheduled;
  "assimilate/termination": typeof assimilate_termination;
  "assimilate/validators": typeof assimilate_validators;
  "audio/actions": typeof audio_actions;
  "audio/mutations": typeof audio_mutations;
  "audio/queries": typeof audio_queries;
  "audio/scheduled": typeof audio_scheduled;
  "chat/agent": typeof chat_agent;
  "chat/agentMutations": typeof chat_agentMutations;
  "chat/context": typeof chat_context;
  "chat/index": typeof chat_index;
  "chat/prompts": typeof chat_prompts;
  "chat/specialistPrompts": typeof chat_specialistPrompts;
  "chat/specialists": typeof chat_specialists;
  "chat/toolActions": typeof chat_toolActions;
  "chat/toolExecutor": typeof chat_toolExecutor;
  "chat/tools": typeof chat_tools;
  "chat/triage": typeof chat_triage;
  "chatMessages/index": typeof chatMessages_index;
  "chatMessages/mutations": typeof chatMessages_mutations;
  "chatMessages/queries": typeof chatMessages_queries;
  "citations/mutations": typeof citations_mutations;
  "citations/queries": typeof citations_queries;
  "conversations/index": typeof conversations_index;
  "conversations/mutations": typeof conversations_mutations;
  "conversations/queries": typeof conversations_queries;
  "creators/actions": typeof creators_actions;
  "creators/index": typeof creators_index;
  "creators/internal": typeof creators_internal;
  "creators/mutations": typeof creators_mutations;
  "creators/queries": typeof creators_queries;
  "creators/validators": typeof creators_validators;
  crons: typeof crons;
  "deepResearchIterations/mutations": typeof deepResearchIterations_mutations;
  "deepResearchIterations/queries": typeof deepResearchIterations_queries;
  "deepResearchSessions/mutations": typeof deepResearchSessions_mutations;
  "deepResearchSessions/queries": typeof deepResearchSessions_queries;
  "documents/index": typeof documents_index;
  "documents/mutations": typeof documents_mutations;
  "documents/queries": typeof documents_queries;
  "documents/scheduled": typeof documents_scheduled;
  "documents/search": typeof documents_search;
  "documents/storage": typeof documents_storage;
  "feeds/actions": typeof feeds_actions;
  "feeds/index": typeof feeds_index;
  "feeds/internal": typeof feeds_internal;
  "feeds/mutations": typeof feeds_mutations;
  "feeds/queries": typeof feeds_queries;
  "feeds/validators": typeof feeds_validators;
  http: typeof http;
  "imports/mutations": typeof imports_mutations;
  "improvements/actions": typeof improvements_actions;
  "improvements/internal": typeof improvements_internal;
  "improvements/mutations": typeof improvements_mutations;
  "improvements/prompts": typeof improvements_prompts;
  "improvements/queries": typeof improvements_queries;
  "improvements/search": typeof improvements_search;
  "lib/ai/embeddings_provider": typeof lib_ai_embeddings_provider;
  "lib/ai/zai_provider": typeof lib_ai_zai_provider;
  "lib/categories": typeof lib_categories;
  "lib/json": typeof lib_json;
  "lib/strings": typeof lib_strings;
  "migrations/backfill_chat_titles": typeof migrations_backfill_chat_titles;
  "migrations/backfill_infeed": typeof migrations_backfill_infeed;
  "migrations/backfill_missing_embeddings": typeof migrations_backfill_missing_embeddings;
  "migrations/backfill_research_documents": typeof migrations_backfill_research_documents;
  "migrations/cleanup_irrelevant_twitter": typeof migrations_cleanup_irrelevant_twitter;
  "migrations/cleanup_irrelevant_twitter_actions": typeof migrations_cleanup_irrelevant_twitter_actions;
  "migrations/reembed_documents_1024": typeof migrations_reembed_documents_1024;
  "migrations/refactor_deep_research_messages": typeof migrations_refactor_deep_research_messages;
  "migrations/remove_twitter_content": typeof migrations_remove_twitter_content;
  "migrations/strip_platform_prefix": typeof migrations_strip_platform_prefix;
  "notifications/index": typeof notifications_index;
  "notifications/internal": typeof notifications_internal;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "plans/confirmation": typeof plans_confirmation;
  "plans/generator": typeof plans_generator;
  "plans/index": typeof plans_index;
  "plans/mutations": typeof plans_mutations;
  "plans/queries": typeof plans_queries;
  "rateLimits/index": typeof rateLimits_index;
  "rateLimits/mutations": typeof rateLimits_mutations;
  "rateLimits/queries": typeof rateLimits_queries;
  "research/actions": typeof research_actions;
  "research/confidence": typeof research_confidence;
  "research/context": typeof research_context;
  "research/dispatcher": typeof research_dispatcher;
  "research/documentQueries": typeof research_documentQueries;
  "research/documents": typeof research_documents;
  "research/embeddings": typeof research_embeddings;
  "research/index": typeof research_index;
  "research/intent": typeof research_intent;
  "research/mode_prompts": typeof research_mode_prompts;
  "research/mutations": typeof research_mutations;
  "research/output": typeof research_output;
  "research/parallel": typeof research_parallel;
  "research/parallel_iteration": typeof research_parallel_iteration;
  "research/prompts": typeof research_prompts;
  "research/queries": typeof research_queries;
  "research/rateLimiter": typeof research_rateLimiter;
  "research/scheduled": typeof research_scheduled;
  "research/search": typeof research_search;
  "research/specialists/academic": typeof research_specialists_academic;
  "research/specialists/index": typeof research_specialists_index;
  "research/specialists/product_finder": typeof research_specialists_product_finder;
  "research/specialists/service_finder": typeof research_specialists_service_finder;
  "research/specialists/technical": typeof research_specialists_technical;
  "research/termination": typeof research_termination;
  "research/tools": typeof research_tools;
  "researchIterations/mutations": typeof researchIterations_mutations;
  "researchIterations/queries": typeof researchIterations_queries;
  "researchSessions/mutations": typeof researchSessions_mutations;
  "researchSessions/queries": typeof researchSessions_queries;
  "shop/dispatcher": typeof shop_dispatcher;
  "shop/index": typeof shop_index;
  "shop/mutations": typeof shop_mutations;
  "shop/queries": typeof shop_queries;
  "shop/search": typeof shop_search;
  "subscriptions/actions": typeof subscriptions_actions;
  "subscriptions/ai_scoring": typeof subscriptions_ai_scoring;
  "subscriptions/deduplication": typeof subscriptions_deduplication;
  "subscriptions/deduplication_helpers": typeof subscriptions_deduplication_helpers;
  "subscriptions/feedback": typeof subscriptions_feedback;
  "subscriptions/index": typeof subscriptions_index;
  "subscriptions/internal": typeof subscriptions_internal;
  "subscriptions/links": typeof subscriptions_links;
  "subscriptions/mutations": typeof subscriptions_mutations;
  "subscriptions/queries": typeof subscriptions_queries;
  "synthesis/rateLimits": typeof synthesis_rateLimits;
  taskCrons: typeof taskCrons;
  "tasks/index": typeof tasks_index;
  "tasks/mutations": typeof tasks_mutations;
  "tasks/queries": typeof tasks_queries;
  "tasks/workflow": typeof tasks_workflow;
  "toolCalls/mutations": typeof toolCalls_mutations;
  "toolCalls/queries": typeof toolCalls_queries;
  "toolCalls/scheduled": typeof toolCalls_scheduled;
  "toolbelt/index": typeof toolbelt_index;
  "toolbelt/mutations": typeof toolbelt_mutations;
  "toolbelt/queries": typeof toolbelt_queries;
  "toolbelt/search": typeof toolbelt_search;
  "toolbelt/storage": typeof toolbelt_storage;
  "transcripts/index": typeof transcripts_index;
  "transcripts/internal": typeof transcripts_internal;
  "transcripts/mutations": typeof transcripts_mutations;
  "transcripts/nodeTranscript": typeof transcripts_nodeTranscript;
  "transcripts/oauth": typeof transcripts_oauth;
  "transcripts/queries": typeof transcripts_queries;
  "transcripts/scheduled": typeof transcripts_scheduled;
  "transcripts/service": typeof transcripts_service;
  "voice/actions": typeof voice_actions;
  "voice/context": typeof voice_context;
  "voice/executeTool": typeof voice_executeTool;
  "voice/mutations": typeof voice_mutations;
  "voice/queries": typeof voice_queries;
  "voice/scheduled": typeof voice_scheduled;
  whatsNew: typeof whatsNew;
  "whatsNew/actions": typeof whatsNew_actions;
  "whatsNew/config": typeof whatsNew_config;
  "whatsNew/index": typeof whatsNew_index;
  "whatsNew/internal": typeof whatsNew_internal;
  "whatsNew/llm": typeof whatsNew_llm;
  "whatsNew/mutations": typeof whatsNew_mutations;
  "whatsNew/quality": typeof whatsNew_quality;
  "whatsNew/queries": typeof whatsNew_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  workflow: {
    event: {
      create: FunctionReference<
        "mutation",
        "internal",
        { name: string; workflowId: string },
        string
      >;
      send: FunctionReference<
        "mutation",
        "internal",
        {
          eventId?: string;
          name?: string;
          result:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId?: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        string
      >;
    };
    journal: {
      load: FunctionReference<
        "query",
        "internal",
        { shortCircuit?: boolean; workflowId: string },
        {
          blocked?: boolean;
          journalEntries: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          ok: boolean;
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      startSteps: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          steps: Array<{
            retry?:
              | boolean
              | { base: number; initialBackoffMs: number; maxAttempts: number };
            schedulerOptions?: { runAt?: number } | { runAfter?: number };
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
          }>;
          workflowId: string;
          workpoolOptions?: {
            defaultRetryBehavior?: {
              base: number;
              initialBackoffMs: number;
              maxAttempts: number;
            };
            logLevel?: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
            maxParallelism?: number;
            retryActionsByDefault?: boolean;
          };
        },
        Array<{
          _creationTime: number;
          _id: string;
          step:
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                functionType: "query" | "mutation" | "action";
                handle: string;
                inProgress: boolean;
                kind?: "function";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workId?: string;
              }
            | {
                args: any;
                argsSize: number;
                completedAt?: number;
                handle: string;
                inProgress: boolean;
                kind: "workflow";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
                workflowId?: string;
              }
            | {
                args: { eventId?: string };
                argsSize: number;
                completedAt?: number;
                eventId?: string;
                inProgress: boolean;
                kind: "event";
                name: string;
                runResult?:
                  | { kind: "success"; returnValue: any }
                  | { error: string; kind: "failed" }
                  | { kind: "canceled" };
                startedAt: number;
              };
          stepNumber: number;
          workflowId: string;
        }>
      >;
    };
    workflow: {
      cancel: FunctionReference<
        "mutation",
        "internal",
        { workflowId: string },
        null
      >;
      cleanup: FunctionReference<
        "mutation",
        "internal",
        { force?: boolean; workflowId: string },
        boolean
      >;
      complete: FunctionReference<
        "mutation",
        "internal",
        {
          generationNumber: number;
          runResult:
            | { kind: "success"; returnValue: any }
            | { error: string; kind: "failed" }
            | { kind: "canceled" };
          workflowId: string;
        },
        null
      >;
      create: FunctionReference<
        "mutation",
        "internal",
        {
          maxParallelism?: number;
          onComplete?: { context?: any; fnHandle: string };
          startAsync?: boolean;
          workflowArgs: any;
          workflowHandle: string;
          workflowName: string;
        },
        string
      >;
      getStatus: FunctionReference<
        "query",
        "internal",
        { workflowId: string },
        {
          inProgress: Array<{
            _creationTime: number;
            _id: string;
            step:
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  functionType: "query" | "mutation" | "action";
                  handle: string;
                  inProgress: boolean;
                  kind?: "function";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workId?: string;
                }
              | {
                  args: any;
                  argsSize: number;
                  completedAt?: number;
                  handle: string;
                  inProgress: boolean;
                  kind: "workflow";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                  workflowId?: string;
                }
              | {
                  args: { eventId?: string };
                  argsSize: number;
                  completedAt?: number;
                  eventId?: string;
                  inProgress: boolean;
                  kind: "event";
                  name: string;
                  runResult?:
                    | { kind: "success"; returnValue: any }
                    | { error: string; kind: "failed" }
                    | { kind: "canceled" };
                  startedAt: number;
                };
            stepNumber: number;
            workflowId: string;
          }>;
          logLevel: "DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR";
          workflow: {
            _creationTime: number;
            _id: string;
            args: any;
            generationNumber: number;
            logLevel?: any;
            name?: string;
            onComplete?: { context?: any; fnHandle: string };
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt?: any;
            state?: any;
            workflowHandle: string;
          };
        }
      >;
      list: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listByName: FunctionReference<
        "query",
        "internal",
        {
          name: string;
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            context?: any;
            name?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      listSteps: FunctionReference<
        "query",
        "internal",
        {
          order: "asc" | "desc";
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          workflowId: string;
        },
        {
          continueCursor: string;
          isDone: boolean;
          page: Array<{
            args: any;
            completedAt?: number;
            eventId?: string;
            kind: "function" | "workflow" | "event";
            name: string;
            nestedWorkflowId?: string;
            runResult?:
              | { kind: "success"; returnValue: any }
              | { error: string; kind: "failed" }
              | { kind: "canceled" };
            startedAt: number;
            stepId: string;
            stepNumber: number;
            workId?: string;
            workflowId: string;
          }>;
          pageStatus?: "SplitRecommended" | "SplitRequired" | null;
          splitCursor?: string | null;
        }
      >;
      restart: FunctionReference<
        "mutation",
        "internal",
        { from?: number | string; startAsync?: boolean; workflowId: string },
        null
      >;
    };
  };
};
