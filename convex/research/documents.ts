/**
 * Research Document Creation
 *
 * Creates searchable documents from completed deep research sessions.
 * Called via scheduler from completeDeepResearchSession mutation.
 */

"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import {
  generateConfidenceReport,
  type FormattedFinding,
  type ConfidenceFilter,
} from "./output";
import type { Id } from "../_generated/dataModel";
import type {
  FindingWithCitations,
  IterationWithStats,
} from "./documentQueries";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { buildFinalSynthesisPrompt } from "./prompts";

/**
 * Create a document from completed deep research session
 * Called via scheduler from completeDeepResearchSession mutation
 */
export const createResearchDocument = internalAction({
  args: { sessionId: v.id("deepResearchSessions") },
  handler: async (ctx, { sessionId }): Promise<{ status: string; error?: string; reason?: string; documentId?: string }> => {

    // 1. Get session
    const session = await ctx.runQuery(internal.research.documentQueries.getSessionForDocument, {
      sessionId,
    });

    if (!session) {
      
      return { status: "error", error: "Session not found" };
    }

    if (session.documentId) {
      
      return { status: "skipped", reason: "Document already exists" };
    }

    // 2. Get findings with citations
    const findings = await ctx.runQuery(internal.research.documentQueries.getFindingsForDocument, {
      sessionId,
    });


    // 3. If no findings, check for iterations (parallel strategies)
    let content: string;
    let stats: {
      totalClaims: number;
      highConfidenceCount: number;
      mediumConfidenceCount: number;
      lowConfidenceCount: number;
      averageConfidenceScore: number;
      claimsWithMultipleSources: number;
    };

    if (findings.length > 0) {
      // Format findings for report
      const formattedFindings: FormattedFinding[] = findings.map((f: FindingWithCitations) => ({
        claimText: f.claimText,
        claimCategory: f.claimCategory,
        confidenceScore: f.confidenceScore,
        confidenceLevel: f.confidenceLevel as "HIGH" | "MEDIUM" | "LOW",
        caveats: f.caveats ?? [],
        warnings: f.warnings ?? [],
        citations: f.citations.filter(Boolean).map((c) => ({
          url: c!.sourceUrl,
          title: c!.sourceTitle ?? undefined,
          domain: c!.sourceDomain ?? undefined,
        })),
        sourceCount: f.citationIds.length,
      }));

      // Calculate confidence stats
      stats = {
        totalClaims: formattedFindings.length,
        highConfidenceCount: formattedFindings.filter(
          (f) => f.confidenceLevel === "HIGH"
        ).length,
        mediumConfidenceCount: formattedFindings.filter(
          (f) => f.confidenceLevel === "MEDIUM"
        ).length,
        lowConfidenceCount: formattedFindings.filter(
          (f) => f.confidenceLevel === "LOW"
        ).length,
        averageConfidenceScore: Math.round(
          formattedFindings.reduce((s, f) => s + f.confidenceScore, 0) /
            (formattedFindings.length || 1)
        ),
        claimsWithMultipleSources: formattedFindings.filter(
          (f) => f.sourceCount >= 3
        ).length,
      };

      // Generate report
      const confidenceFilter = (session.outputConfidenceFilter || "ALL") as ConfidenceFilter;
      content = generateConfidenceReport(
        session.topic,
        stats,
        formattedFindings,
        confidenceFilter
      );
    } else {
      // Fall back to LLM synthesis of iteration findings
      const iterations = await ctx.runQuery(
        internal.research.documentQueries.getIterationsForDocument,
        { sessionId }
      );

      

      if (iterations.length === 0) {
        
        content = `# Research Report: ${session.topic}\n\nNo detailed findings available.`;
        stats = {
          totalClaims: 0,
          highConfidenceCount: 0,
          mediumConfidenceCount: 0,
          lowConfidenceCount: 0,
          averageConfidenceScore: 0,
          claimsWithMultipleSources: 0,
        };
      } else {
        // Build synthesis prompt from iterations
        const synthesisPrompt = buildFinalSynthesisPrompt(
          session.topic,
          iterations.map((it: IterationWithStats) => ({
            iterationNumber: it.iterationNumber,
            findings: it.findings ?? '',
            coverageScore: it.coverageScore,
            summary: it.summary,
          })),
          (session as any).researchMode as any
        );

        // Call LLM to synthesize findings into cohesive report
        // Using gpt-5.4 for final synthesis - brings together ideas from iterations
        const result = await generateText({
          model: openai("gpt-5.4"),
          prompt: synthesisPrompt,
        });

        content = `# Research Report: ${session.topic}\n\n${result.text}`;

        // Calculate stats from iterations
        type ConfidenceStatsType = NonNullable<IterationWithStats["confidenceStats"]>;
        const allStats: ConfidenceStatsType[] = iterations
          .filter((it: IterationWithStats) => it.confidenceStats)
          .map((it: IterationWithStats) => it.confidenceStats!);

        if (allStats.length > 0) {
          stats = {
            totalClaims: allStats.reduce((s: number, st: ConfidenceStatsType) => s + st.totalClaims, 0),
            highConfidenceCount: allStats.reduce(
              (s: number, st: ConfidenceStatsType) => s + st.highConfidenceCount,
              0
            ),
            mediumConfidenceCount: allStats.reduce(
              (s: number, st: ConfidenceStatsType) => s + st.mediumConfidenceCount,
              0
            ),
            lowConfidenceCount: allStats.reduce(
              (s: number, st: ConfidenceStatsType) => s + st.lowConfidenceCount,
              0
            ),
            averageConfidenceScore: Math.round(
              allStats.reduce((s: number, st: ConfidenceStatsType) => s + st.averageConfidenceScore, 0) /
                allStats.length
            ),
            claimsWithMultipleSources: allStats.reduce(
              (s: number, st: ConfidenceStatsType) => s + st.claimsWithMultipleSources,
              0
            ),
          };
        } else {
          stats = {
            totalClaims: iterations.length,
            highConfidenceCount: 0,
            mediumConfidenceCount: iterations.length,
            lowConfidenceCount: 0,
            averageConfidenceScore: 50,
            claimsWithMultipleSources: 0,
          };
        }
      }
    }

    // 6. Create document with embedding
    const result: { documentId: string; embeddingDimensions: number; embeddingStatus: string } = await ctx.runAction(api.documents.storage.createWithEmbedding, {
      title: session.topic,
      content,
      category: "research",
      researchType: session.researchType,
      iterations: session.currentIteration,
    });

    

    // 7. Link document to session
    await ctx.runMutation(internal.research.mutations.updateDeepResearchSessionDocumentId, {
      sessionId,
      documentId: result.documentId as Id<"documents">,
    });

    

    // 8. Post result card to conversation
    // Extract key findings from the content for the card preview
    const keyFindings: string[] = [];
    const findingMatches = content.match(/### \d+\.\s+(?:🟢|🟡|🔴)[\s\S]*?\*\*Sources\*\*[\s\S]*?\n\n/g);
    if (findingMatches) {
      findingMatches.slice(0, 5).forEach(match => {
        const claimMatch = match.match(/### \d+\.\s+[\s\S]*?\n([\s\S]*?)\n\*\*Sources\*\*/);
        if (claimMatch && claimMatch[1]) {
          // Extract just the first line or two of the finding
          const claim = claimMatch[1].trim().split('\n')[0].slice(0, 100);
          keyFindings.push(claim);
        }
      });
    }

    // Calculate coverage score from confidence stats
    const avgConfidence = stats.averageConfidenceScore;
    const coverageScore = avgConfidence >= 75 ? 4 : avgConfidence >= 50 ? 3 : avgConfidence > 0 ? 2 : 1;

    await ctx.runMutation(api.chatMessages.mutations.create, {
      conversationId: session.conversationId,
      role: "agent" as const,
      content: `Research complete: ${session.topic}\n\nDocument created with ${stats.totalClaims} findings.`,
      messageType: "result_card" as const,
      cardData: {
        card_type: "deep_research_result",
        session_id: sessionId,
        document_id: result.documentId,
        topic: session.topic,
        preview: content.slice(0, 500) + "...",
        full_markdown: content,
        coverage_score: coverageScore,
        iterations_completed: session.currentIteration ?? 1,
        confidence_stats: {
          total_claims: stats.totalClaims,
          high_confidence: stats.highConfidenceCount,
          medium_confidence: stats.mediumConfidenceCount,
          low_confidence: stats.lowConfidenceCount,
          average_score: stats.averageConfidenceScore,
          multi_source: stats.claimsWithMultipleSources,
        },
        key_findings: keyFindings.length > 0 ? keyFindings : [`Research completed with ${stats.totalClaims} findings`],
      },
    });


    return { documentId: result.documentId, status: "created" };
  },
});

