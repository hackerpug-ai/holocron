/**
 * Assimilation Scheduled Functions — Core Ralph Loop
 *
 * Background job processing for assimilation iterations.
 * Prevents timeout by processing one iteration at a time,
 * scheduling the next via ctx.scheduler.
 *
 * Flow:
 *   startAssimilation → processIteration (iter 0 = PLANNING)
 *   → pending_approval (human reviews) or auto-approve
 *   → processIteration (iter 1+ = ANALYSIS per dimension)
 *   → synthesizeAndSave (final synthesis)
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { exaSearchTool, jinaSearchTool, jinaReaderTool } from "../research/tools";
import {
  buildPlanningPrompt,
  buildAnalysisPrompt,
  buildEvaluationPrompt,
  buildSynthesisPrompt,
} from "./prompts";
import { evaluateTermination, isDimensionSaturated } from "./termination";
import type { AssimilationMetrics } from "./termination";
import {
  DEFAULT_DIMENSION_SEQUENCE,
  INITIAL_DIMENSION_SCORES,
} from "./validators";
import type { AssimilationDimension, DimensionScores } from "./validators";
import { stripMarkdownCodeBlock } from "../lib/json";
import { zaiFlash, zaiPro } from "../lib/ai/zai_provider";

// ── processIteration ─────────────────────────────────────────────────────────

/**
 * Process one assimilation iteration.
 *
 * Iteration 0: PLANNING — reads repo structure, generates coverage plan,
 *              waits for human approval (or auto-approves).
 * Iterations 1+: ANALYSIS — one dimension per iteration, accumulates notes,
 *               evaluates termination, schedules next or synthesizes.
 */
export const processIteration = internalAction({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    console.log(`[processIteration] Entry - sessionId: ${sessionId}`);

    try {
      // ── Load session ───────────────────────────────────────────────────────
      const session = await ctx.runQuery(
        internal.assimilate.queries.getSessionInternal,
        { sessionId }
      );

      if (!session) {
        console.error(`[processIteration] Session not found: ${sessionId}`);
        return;
      }

      // Guard: terminal statuses
      const terminalStatuses = ["completed", "failed", "cancelled", "rejected"];
      if (terminalStatuses.includes(session.status)) {
        console.log(
          `[processIteration] Session already ${session.status}, skipping`
        );
        return;
      }

      const { terminationCriteria, currentIteration } = session;
      const now = Date.now();

      // Guard: cost limit
      if (
        (session.estimatedCostUsd ?? 0) >= terminationCriteria.maxCostUsd
      ) {
        console.log(`[processIteration] Cost limit reached — failing session`);
        await ctx.runMutation(internal.assimilate.mutations.completeSession, {
          sessionId,
          status: "failed",
          errorReason: `Cost limit reached ($${(session.estimatedCostUsd ?? 0).toFixed(2)})`,
        });
        return;
      }

      // Guard: duration limit
      const elapsedMs = now - (session.startedAt ?? now);
      if (elapsedMs >= terminationCriteria.maxDurationMs) {
        console.log(`[processIteration] Duration limit reached — failing session`);
        await ctx.runMutation(internal.assimilate.mutations.completeSession, {
          sessionId,
          status: "failed",
          errorReason: `Duration limit reached (${Math.round(elapsedMs / 60000)}m)`,
        });
        return;
      }

      // ── PLANNING (iteration 0) ─────────────────────────────────────────────
      if (currentIteration === 0) {
        console.log(`[processIteration] PLANNING phase - iteration 0`);

        // Fetch repo structure via Jina Reader
        const repoUrl = `https://r.jina.ai/${session.repositoryUrl}`;
        console.log(`[processIteration] Fetching repo via Jina Reader: ${repoUrl}`);

        let repoStructure = "";
        try {
          const apiKey = process.env.JINA_API_KEY ?? "";
          const repoResponse = await fetch(repoUrl, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "X-Return-Format": "markdown",
            },
          });
          if (repoResponse.ok) {
            repoStructure = await repoResponse.text();
            repoStructure = repoStructure.slice(0, 10000);
          } else {
            console.warn(
              `[processIteration] Jina Reader returned ${repoResponse.status} — proceeding with empty structure`
            );
          }
        } catch (fetchErr) {
          console.warn(`[processIteration] Jina Reader fetch failed:`, fetchErr);
        }

        // Build and run planning prompt
        const planningPrompt = buildPlanningPrompt(
          repoStructure,
          session.repositoryName,
          session.profile,
          session.planFeedback
        );

        console.log(`[processIteration] Calling zaiFlash for planning`);
        const planResult = await generateText({
          model: zaiFlash(),
          prompt: planningPrompt,
        });

        // Parse JSON response
        let planContent = "";
        let planSummary = "";
        let coveragePlan: unknown = null;

        try {
          const cleanedJson = stripMarkdownCodeBlock(planResult.text);
          const parsed = JSON.parse(cleanedJson);
          planContent = parsed.planContent ?? "";
          planSummary = parsed.planSummary ?? "";
          coveragePlan = parsed.coveragePlan ?? null;
        } catch (parseErr) {
          console.error(
            `[processIteration] Failed to parse planning JSON:`,
            parseErr
          );
          // Fall back to raw text as planContent
          planContent = planResult.text;
          planSummary = "Coverage plan generated";
        }

        // Save planning iteration record
        await ctx.runMutation(internal.assimilate.mutations.createIteration, {
          sessionId,
          iterationNumber: 0,
          dimension: "planning",
          iterationType: "plan",
          findings: planContent,
          notesContribution: planSummary,
          summary: planSummary.slice(0, 80),
          status: "completed",
        });

        // Update session with plan data
        await ctx.runMutation(
          internal.assimilate.mutations.updateSessionProgress,
          {
            sessionId,
            planContent,
            planSummary,
            coveragePlan,
            dimensionScores: INITIAL_DIMENSION_SCORES,
          }
        );

        if (session.autoApprove) {
          console.log(
            `[processIteration] autoApprove=true — moving to in_progress`
          );
          await ctx.runMutation(
            internal.assimilate.mutations.updateSessionProgress,
            {
              sessionId,
              status: "in_progress",
              currentIteration: 1,
            }
          );
          await ctx.scheduler.runAfter(
            1000,
            internal.assimilate.scheduled.processIteration,
            { sessionId }
          );
        } else {
          console.log(
            `[processIteration] autoApprove=false — waiting for human approval`
          );
          await ctx.runMutation(
            internal.assimilate.mutations.updateSessionProgress,
            {
              sessionId,
              status: "pending_approval",
            }
          );
          // STOP — wait for approveAssimilationPlan mutation to resume
        }

        console.log(`[processIteration] PLANNING complete`);
        return;
      }

      // ── ANALYSIS (iterations 1+) ───────────────────────────────────────────
      console.log(
        `[processIteration] ANALYSIS phase - iteration ${currentIteration}`
      );

      // Determine current dimension
      const dimension: AssimilationDimension =
        (session.nextDimension as AssimilationDimension) ??
        DEFAULT_DIMENSION_SEQUENCE[
          (currentIteration - 1) % DEFAULT_DIMENSION_SEQUENCE.length
        ];

      console.log(`[processIteration] Analyzing dimension: ${dimension}`);

      // Read and clear steering note
      const steeringNote = session.steeringNote;
      if (steeringNote) {
        await ctx.runMutation(
          internal.assimilate.mutations.updateSessionProgress,
          { sessionId, steeringNote: "" }
        );
      }

      const accumulatedNotes = session.accumulatedNotes ?? "";
      const dimensionScores: DimensionScores =
        session.dimensionScores ?? { ...INITIAL_DIMENSION_SCORES };
      const failureConstraints = session.failureConstraints ?? [];
      const coveragePlan = session.coveragePlan;
      const previousDimensionScore = dimensionScores[dimension];

      // Optionally fetch key files based on coverage plan
      let repoContent = "";
      if (coveragePlan && typeof coveragePlan === "object") {
        const plan = coveragePlan as {
          dimensions?: Array<{ name: string; keyFiles?: string[] }>;
        };
        const dimPlan = plan.dimensions?.find((d) => d.name === dimension);
        const keyFiles = dimPlan?.keyFiles?.slice(0, 2) ?? [];

        for (const filePath of keyFiles) {
          const fileUrl = `${session.repositoryUrl}/blob/main/${filePath}`;
          try {
            const apiKey = process.env.JINA_API_KEY ?? "";
            const fileResponse = await fetch(`https://r.jina.ai/${fileUrl}`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "X-Return-Format": "markdown",
              },
            });
            if (fileResponse.ok) {
              const fileContent = await fileResponse.text();
              repoContent += `\n\n### ${filePath}\n\n${fileContent.slice(0, 3000)}`;
            }
          } catch (fetchErr) {
            console.warn(
              `[processIteration] Failed to fetch key file ${filePath}:`,
              fetchErr
            );
          }
        }
      }

      // SEARCH phase: use gpt-4o-mini + search tools
      console.log(`[processIteration] SEARCH phase starting`);
      const analysisPrompt = buildAnalysisPrompt(
        session.repositoryName,
        dimension,
        accumulatedNotes,
        coveragePlan,
        dimensionScores,
        failureConstraints,
        steeringNote,
        repoContent || undefined
      );

      const searchResult = await generateText({
        model: openai("gpt-4o-mini"),
        prompt: analysisPrompt,
        tools: {
          jinaSearch: jinaSearchTool,
          exaSearch: exaSearchTool,
          jinaReader: jinaReaderTool,
        },
      });

      const toolResults = searchResult.toolResults ?? [];
      const rawSearchOutput =
        toolResults.length > 0
          ? JSON.stringify(toolResults, null, 2)
          : searchResult.text ?? "No search results";

      console.log(
        `[processIteration] SEARCH complete - ${rawSearchOutput.length} chars, ${toolResults.length} tool calls`
      );

      // ANALYZE phase: parse findings from search output
      let findings = "";
      let notesContribution = "";
      let dimensionCoverageScore = previousDimensionScore;
      let gaps: string[] = [];
      let summary = "";

      // Build a synthesis prompt inline to extract structured output from search results
      const extractPrompt = buildAnalysisPrompt(
        session.repositoryName,
        dimension,
        accumulatedNotes,
        coveragePlan,
        dimensionScores,
        failureConstraints,
        steeringNote,
        rawSearchOutput.slice(0, 12000)
      );

      const analyzeResult = await generateText({
        model: zaiFlash(),
        prompt: extractPrompt,
      });

      try {
        const cleanedJson = stripMarkdownCodeBlock(analyzeResult.text);
        const parsed = JSON.parse(cleanedJson);
        findings = parsed.findings ?? analyzeResult.text;
        notesContribution = parsed.notesContribution ?? "";
        dimensionCoverageScore = parsed.dimensionCoverageScore ?? previousDimensionScore;
        gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
        summary = parsed.summary ?? `${dimension} analyzed`;
      } catch (parseErr) {
        console.error(
          `[processIteration] Failed to parse analysis JSON:`,
          parseErr
        );
        findings = analyzeResult.text;
        notesContribution = findings.slice(0, 300);
        summary = `${dimension} analyzed`;
      }

      console.log(
        `[processIteration] ANALYZE complete - score: ${dimensionCoverageScore}, gaps: ${gaps.length}`
      );

      // EVALUATE phase: noveltyScore and next action
      console.log(`[processIteration] EVALUATE phase starting`);
      const evalPrompt = buildEvaluationPrompt(
        findings,
        accumulatedNotes,
        { ...dimensionScores, [dimension]: dimensionCoverageScore },
        dimension
      );

      const evalResult = await generateText({
        model: zaiFlash(),
        prompt: evalPrompt,
      });

      let noveltyScore = 50;
      let nextDimensionFromEval: string | undefined;
      let nextAction: {
        shouldContinue: boolean;
        nextDimension?: string;
        reason: string;
        trigger?: string;
      } = { shouldContinue: true, reason: "default continue" };

      try {
        const cleanedJson = stripMarkdownCodeBlock(evalResult.text);
        const parsed = JSON.parse(cleanedJson);
        noveltyScore = parsed.noveltyScore ?? 50;
        nextDimensionFromEval = parsed.nextDimension ?? undefined;
        nextAction = {
          shouldContinue: parsed.shouldContinue ?? true,
          nextDimension: parsed.nextDimension ?? undefined,
          reason: parsed.reason ?? "",
          trigger: parsed.trigger ?? undefined,
        };
      } catch (parseErr) {
        console.error(
          `[processIteration] Failed to parse evaluation JSON:`,
          parseErr
        );
      }

      console.log(
        `[processIteration] EVALUATE complete - novelty: ${noveltyScore}, continue: ${nextAction.shouldContinue}`
      );

      // Estimate iteration cost (~$0.002 per iteration as rough approximation)
      const iterationCostUsd = 0.002;
      const newEstimatedCost =
        (session.estimatedCostUsd ?? 0) + iterationCostUsd;

      // Save iteration record
      await ctx.runMutation(internal.assimilate.mutations.createIteration, {
        sessionId,
        iterationNumber: currentIteration,
        dimension,
        iterationType: "analyze",
        findings,
        notesContribution,
        summary,
        dimensionCoverageScore,
        gapsIdentified: gaps,
        noveltyScore,
        nextAction,
        status: "completed",
        estimatedCostUsd: iterationCostUsd,
      });

      // Build updated dimension scores
      const updatedDimensionScores: DimensionScores = {
        ...dimensionScores,
        [dimension]: dimensionCoverageScore,
      };

      // Append notes contribution to accumulated notes
      const updatedNotes = accumulatedNotes
        ? `${accumulatedNotes}\n\n[Iteration ${currentIteration} — ${dimension}]: ${notesContribution}`
        : `[Iteration ${currentIteration} — ${dimension}]: ${notesContribution}`;

      // Track saturation
      const saturated = isDimensionSaturated(
        notesContribution,
        previousDimensionScore,
        dimensionCoverageScore,
        terminationCriteria.noveltyThreshold
      );

      let updatedFailureConstraints = [...failureConstraints];
      if (saturated && !failureConstraints.includes(dimension)) {
        updatedFailureConstraints = [...failureConstraints, dimension];
        console.log(
          `[processIteration] Dimension "${dimension}" saturated — adding to constraints`
        );
      }

      // Update session progress
      await ctx.runMutation(
        internal.assimilate.mutations.updateSessionProgress,
        {
          sessionId,
          accumulatedNotes: updatedNotes,
          dimensionScores: updatedDimensionScores,
          nextDimension: nextDimensionFromEval ?? undefined,
          currentIteration: currentIteration + 1,
          estimatedCostUsd: newEstimatedCost,
          failureConstraints: updatedFailureConstraints,
        }
      );

      // Evaluate termination
      const saturatedDims = updatedFailureConstraints.filter(
        (c) =>
          ["architecture", "patterns", "documentation", "dependencies", "testing"].includes(c)
      ) as AssimilationDimension[];

      const metrics: AssimilationMetrics = {
        iteration: currentIteration + 1,
        costUsd: newEstimatedCost,
        durationMs: Date.now() - (session.startedAt ?? now),
        dimensionScores: updatedDimensionScores,
        saturatedDimensions: saturatedDims,
        synthesisComplete: false,
      };

      const termination = evaluateTermination(metrics, terminationCriteria);
      console.log(
        `[processIteration] Termination: trigger=${termination.trigger}, continue=${termination.continue}, reason="${termination.reason}"`
      );

      if (termination.continue && termination.trigger !== "needs_synthesis") {
        // Schedule next analysis iteration
        await ctx.scheduler.runAfter(
          1000,
          internal.assimilate.scheduled.processIteration,
          { sessionId }
        );
      } else {
        // needs_synthesis or stop — proceed to synthesis
        console.log(
          `[processIteration] Proceeding to synthesis (trigger: ${termination.trigger})`
        );
        await ctx.scheduler.runAfter(
          0,
          internal.assimilate.scheduled.synthesizeAndSave,
          { sessionId }
        );
      }

      console.log(`[processIteration] ANALYSIS iteration ${currentIteration} complete`);
    } catch (error) {
      console.error(`[processIteration] ERROR:`, error);
      await ctx.runMutation(internal.assimilate.mutations.completeSession, {
        sessionId,
        status: "failed",
        errorReason:
          error instanceof Error ? error.message : String(error),
      });
    }
  },
});

// ── synthesizeAndSave ─────────────────────────────────────────────────────────

/**
 * Final synthesis: collect all iteration findings, generate assimilation report,
 * save document + metadata, mark session completed.
 */
export const synthesizeAndSave = internalAction({
  args: {
    sessionId: v.id("assimilationSessions"),
  },
  handler: async (ctx, { sessionId }) => {
    console.log(`[synthesizeAndSave] Entry - sessionId: ${sessionId}`);

    try {
      // Update session status to synthesizing
      await ctx.runMutation(
        internal.assimilate.mutations.updateSessionProgress,
        { sessionId, status: "synthesizing" }
      );

      // Load session for final data
      const session = await ctx.runQuery(
        internal.assimilate.queries.getSessionInternal,
        { sessionId }
      );
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      // Load all iterations
      const iterations = await ctx.runQuery(
        internal.assimilate.queries.listIterations,
        { sessionId }
      );

      // Collect all findings strings from analysis iterations (skip planning)
      const allFindings = iterations
        .filter((iter: { iterationType: string; findings?: string }) => iter.iterationType !== "plan" && iter.findings)
        .map((iter: { findings?: string }) => iter.findings as string);

      console.log(
        `[synthesizeAndSave] Synthesizing ${allFindings.length} iteration findings`
      );

      const accumulatedNotes = session.accumulatedNotes ?? "";
      const dimensionScores = session.dimensionScores ?? {
        ...INITIAL_DIMENSION_SCORES,
      };

      // Build synthesis prompt
      const synthesisPrompt = buildSynthesisPrompt(
        session.repositoryName,
        allFindings,
        accumulatedNotes,
        dimensionScores
      );

      console.log(`[synthesizeAndSave] Calling zaiPro for synthesis`);
      const synthesisResult = await generateText({
        model: zaiPro(),
        prompt: synthesisPrompt,
      });

      // Parse synthesis JSON
      let title = `Assimilation: ${session.repositoryName}`;
      let content = synthesisResult.text;
      let trackRatings = {
        architecture: 3,
        patterns: 3,
        documentation: 3,
        dependencies: 3,
        testing: 3,
      };
      let sophisticationRating = 3;
      let primaryLanguage: string | undefined;

      try {
        const cleanedJson = stripMarkdownCodeBlock(synthesisResult.text);
        const parsed = JSON.parse(cleanedJson);
        title = parsed.title ?? title;
        content = parsed.content ?? synthesisResult.text;
        trackRatings = parsed.trackRatings ?? trackRatings;
        sophisticationRating = parsed.sophisticationRating ?? sophisticationRating;
        primaryLanguage = parsed.primaryLanguage;
      } catch (parseErr) {
        console.error(
          `[synthesizeAndSave] Failed to parse synthesis JSON — using raw text:`,
          parseErr
        );
      }

      console.log(
        `[synthesizeAndSave] Synthesis complete - title: "${title}", rating: ${sophisticationRating}`
      );

      // Save assimilation (creates document + metadata)
      const result = await ctx.runMutation(api.assimilate.mutations.saveAssimilation, {
        title,
        content,
        researchType: "assimilation",
        repositoryUrl: session.repositoryUrl,
        repositoryName: session.repositoryName,
        primaryLanguage,
        sophisticationRating,
        trackRatings,
      });

      console.log(
        `[synthesizeAndSave] Saved - documentId: ${result.documentId}, metadataId: ${result.metadataId}`
      );

      // Mark session completed
      await ctx.runMutation(internal.assimilate.mutations.completeSession, {
        sessionId,
        status: "completed",
        documentId: result.documentId,
        metadataId: result.metadataId,
      });

      // Notify that assimilation has finished
      await ctx.runMutation(internal.notifications.internal.create, {
        type: "assimilate_complete",
        title: "Assimilation Complete",
        body: session.repositoryName ? `Assimilation of "${session.repositoryName}" has finished.` : "Your assimilation session has finished.",
        route: `/document/${result.documentId}`,
        referenceId: result.documentId,
      });

      console.log(`[synthesizeAndSave] Session completed successfully`);
    } catch (error) {
      console.error(`[synthesizeAndSave] ERROR:`, error);
      await ctx.runMutation(internal.assimilate.mutations.completeSession, {
        sessionId,
        status: "failed",
        errorReason:
          error instanceof Error ? error.message : String(error),
      });
    }
  },
});

// ── timeoutStuckSessions ──────────────────────────────────────────────────────

/**
 * Housekeeping action: find sessions stuck beyond their duration limit
 * (plus a 5-minute buffer) and mark them as failed.
 *
 * Intended to be called on a cron schedule.
 */
export const timeoutStuckSessions = internalAction({
  args: {},
  handler: async (ctx) => {
    const activeStatuses = [
      "planning",
      "in_progress",
      "synthesizing",
      "pending_approval",
    ];

    const BUFFER_MS = 5 * 60 * 1000; // 5 min buffer
    const now = Date.now();

    // Collect sessions for each active status using the by_status index
    const allActiveSessions = (
      await Promise.all(
        activeStatuses.map((status) =>
          ctx.runQuery(internal.assimilate.queries.getActiveSessionsByStatus, {
            status,
          })
        )
      )
    ).flat();

    if (allActiveSessions.length === 0) return;

    let timedOutCount = 0;

    for (const session of allActiveSessions) {
      const startedAt = session.startedAt ?? session.createdAt;
      const maxDurationMs =
        session.terminationCriteria?.maxDurationMs ?? 15 * 60 * 1000;
      const elapsed = now - startedAt;

      if (elapsed > maxDurationMs + BUFFER_MS) {
        console.log(
          `[timeoutStuckSessions] Timing out session ${session._id} — elapsed: ${Math.round(elapsed / 60000)}m, limit: ${Math.round(maxDurationMs / 60000)}m`
        );
        await ctx.runMutation(internal.assimilate.mutations.completeSession, {
          sessionId: session._id,
          status: "failed",
          errorReason: `timeout`,
        });
        timedOutCount++;
      }
    }

    if (timedOutCount > 0) {
      console.log(
        `[timeoutStuckSessions] Timed out ${timedOutCount} session(s)`
      );
    }
  },
});
