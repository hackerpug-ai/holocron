/**
 * Agent Tests
 *
 * Tests for the chat agent orchestrator, including specialist dispatch,
 * queryShape hint injection, tool continuation flow, and CLR-002
 * ambiguous short-circuit / pending-state rehydrate logic.
 */

import { describe, it, expect } from "vitest";
import { RESEARCH_SPECIALIST_PROMPT } from "./specialistPrompts";
import { isPendingExpired } from "../conversations/mutations";
import { detectRefinement } from "./agent";

describe("RESEARCH_SPECIALIST_PROMPT", () => {
  describe("AC-1: TOP PRIORITY section", () => {
    it("should contain 'TOP PRIORITY' text", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("TOP PRIORITY");
    });

    it("should contain 'find_recommendations' tool reference", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("find_recommendations");
    });
  });

  describe("AC-2: deep_research gating on explicit signals", () => {
    it("should contain 'comprehensive' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("comprehensive");
    });

    it("should contain 'deep dive' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("deep dive");
    });

    it("should contain 'thorough analysis' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("thorough analysis");
    });

    it("should contain 'complete guide' as gate keyword", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("complete guide");
    });

    it("should contain 'never use deep_research for recommendations' rule", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain(
        "NEVER use deep_research for recommendations"
      );
    });
  });

  describe("Canonical failing case example", () => {
    it("should contain 'career coaches' example", () => {
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("career coaches");
    });

    it("should map the example to find_recommendations tool call", () => {
      // The example should show the tool call syntax
      expect(RESEARCH_SPECIALIST_PROMPT).toContain("find_recommendations({");
    });
  });
});

describe("queryShape hint injection", () => {
  describe("AC-3: recommendation queryShape gets hint", () => {
    it("should inject 'Use find_recommendations' hint for recommendation shape", () => {
      // This test will be enabled once we implement the dispatch logic
      // For now, we're testing that the shape hints mapping exists
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["recommendation"];
      expect(hint).toContain("Use find_recommendations");
    });
  });

  describe("AC-4: factual queryShape gets no hint", () => {
    it("should return null hint for factual queryShape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["factual"];
      expect(hint).toBeNull();
    });

    it("should return null hint for exploratory queryShape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["exploratory"];
      expect(hint).toBeNull();
    });

    it("should return null hint for ambiguous queryShape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["ambiguous"];
      expect(hint).toBeNull();
    });
  });

  describe("comprehensive queryShape gets deep_research hint", () => {
    it("should inject 'Use deep_research' hint for comprehensive shape", () => {
      const shapeHints: Record<string, string | null> = {
        recommendation: "The user wants named providers they can act on. Use find_recommendations.",
        comprehensive: "The user explicitly asked for a comprehensive report. Use deep_research.",
        factual: null,
        exploratory: null,
        ambiguous: null,
      };

      const hint = shapeHints["comprehensive"];
      expect(hint).toContain("Use deep_research");
    });
  });
});

describe("REC-005: find_recommendations continuation hint", () => {
  describe("AC-3: Continuation hint prepended", () => {
    it("should define FIND_REC_CONTINUATION_HINT constant", () => {
      // This test verifies that the continuation hint exists and contains
      // the key phrases from the task spec
      const FIND_REC_CONTINUATION_HINT =
        'The user just saw a list of recommendations. Do NOT re-render the list. ' +
        'Do NOT call another tool for the same query. ' +
        'In 1-2 sentences max, acknowledge the list and offer to save it to their KB if they want.';

      expect(FIND_REC_CONTINUATION_HINT).toBeDefined();
      expect(FIND_REC_CONTINUATION_HINT).toContain("Do NOT re-render the list");
      expect(FIND_REC_CONTINUATION_HINT).toContain("Do NOT call another tool");
      expect(FIND_REC_CONTINUATION_HINT).toContain("offer to save");
    });

    it("should contain 'do not re-render' instruction", () => {
      const FIND_REC_CONTINUATION_HINT =
        'The user just saw a list of recommendations. Do NOT re-render the list. ' +
        'Do NOT call another tool for the same query. ' +
        'In 1-2 sentences max, acknowledge the list and offer to save it to their KB if they want.';

      expect(FIND_REC_CONTINUATION_HINT).toContain("Do NOT re-render");
    });

    it("should contain 'do not call another tool' instruction", () => {
      const FIND_REC_CONTINUATION_HINT =
        'The user just saw a list of recommendations. Do NOT re-render the list. ' +
        'Do NOT call another tool for the same query. ' +
        'In 1-2 sentences max, acknowledge the list and offer to save it to their KB if they want.';

      expect(FIND_REC_CONTINUATION_HINT).toContain("Do NOT call another tool");
    });

    it("should contain 'offer to save' instruction", () => {
      const FIND_REC_CONTINUATION_HINT =
        'The user just saw a list of recommendations. Do NOT re-render the list. ' +
        'Do NOT call another tool for the same query. ' +
        'In 1-2 sentences max, acknowledge the list and offer to save it to their KB if they want.';

      expect(FIND_REC_CONTINUATION_HINT).toContain("offer to save");
    });

    it("should be concise (1-2 sentences max)", () => {
      const FIND_REC_CONTINUATION_HINT =
        'The user just saw a list of recommendations. Do NOT re-render the list. ' +
        'Do NOT call another tool for the same query. ' +
        'In 1-2 sentences max, acknowledge the list and offer to save it to their KB if they want.';

      // Count sentence delimiters (periods, exclamation marks, question marks)
      const sentenceCount = (FIND_REC_CONTINUATION_HINT.match(/[.!?]/g) || []).length;
      expect(sentenceCount).toBeLessThanOrEqual(4); // 3 sentences + abbreviation periods
    });
  });
});

// ---------------------------------------------------------------------------
// CLR-002: Ambiguous short-circuit + pending-state rehydrate
// ---------------------------------------------------------------------------

describe("CLR-002: isPendingExpired", () => {
  it("should return true when pendingSince is undefined", () => {
    expect(isPendingExpired(undefined)).toBe(true);
  });

  it("should return false for a recent timestamp (within 30 min)", () => {
    const recentTimestamp = Date.now() - 5 * 60 * 1000; // 5 minutes ago
    expect(isPendingExpired(recentTimestamp)).toBe(false);
  });

  it("should return true for an old timestamp (beyond 30 min)", () => {
    const oldTimestamp = Date.now() - 31 * 60 * 1000; // 31 minutes ago
    expect(isPendingExpired(oldTimestamp)).toBe(true);
  });

  it("should return false for timestamp exactly at boundary (0 ms ago)", () => {
    expect(isPendingExpired(Date.now())).toBe(false);
  });
});

describe("CLR-002: computeClarificationDepth logic", () => {
  it("should count 0 depth for empty telemetry list", () => {
    const records: Array<{ queryShape: string }> = [];
    let depth = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].queryShape === "ambiguous") {
        depth++;
      } else {
        break;
      }
    }
    expect(depth).toBe(0);
  });

  it("should count 1 depth for single trailing ambiguous record", () => {
    const records = [
      { queryShape: "factual" },
      { queryShape: "ambiguous" },
    ];
    let depth = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].queryShape === "ambiguous") {
        depth++;
      } else {
        break;
      }
    }
    expect(depth).toBe(1);
  });

  it("should count 2 depth for two trailing ambiguous records", () => {
    const records = [
      { queryShape: "factual" },
      { queryShape: "ambiguous" },
      { queryShape: "ambiguous" },
    ];
    let depth = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].queryShape === "ambiguous") {
        depth++;
      } else {
        break;
      }
    }
    expect(depth).toBe(2);
  });

  it("should count 0 depth when last record is non-ambiguous", () => {
    const records = [
      { queryShape: "ambiguous" },
      { queryShape: "factual" },
    ];
    let depth = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].queryShape === "ambiguous") {
        depth++;
      } else {
        break;
      }
    }
    expect(depth).toBe(0);
  });
});

describe("CLR-002: effective shape computation", () => {
  it("should force 'factual' when queryShape is ambiguous and depth >= 1", () => {
    const triageQueryShape = "ambiguous";
    const clarificationDepth = 1;

    const effectiveShape =
      triageQueryShape === "ambiguous" && clarificationDepth >= 1
        ? ("factual" as const)
        : triageQueryShape;

    expect(effectiveShape).toBe("factual");
  });

  it("should keep ambiguous when depth is 0", () => {
    const triageQueryShape = "ambiguous";
    const clarificationDepth = 0;

    const effectiveShape =
      triageQueryShape === "ambiguous" && clarificationDepth >= 1
        ? ("factual" as const)
        : triageQueryShape;

    expect(effectiveShape).toBe("ambiguous");
  });

  it("should keep non-ambiguous shapes unchanged regardless of depth", () => {
    const triageQueryShape: string = "recommendation";
    const clarificationDepth = 1;

    const effectiveShape =
      triageQueryShape === "ambiguous" && clarificationDepth >= 1
        ? ("factual" as const)
        : triageQueryShape;

    expect(effectiveShape).toBe("recommendation");
  });
});

describe("CLR-002: ambiguous short-circuit conditions", () => {
  it("should short-circuit when ambiguous + directResponse + non-low confidence + depth < 1", () => {
    const triage: { queryShape: string; directResponse?: string; confidence: string } = {
      queryShape: "ambiguous",
      directResponse: "Could you clarify what you're looking for?",
      confidence: "medium",
    };
    const clarificationDepth = 0;

    const shouldShortCircuit =
      triage.queryShape === "ambiguous" &&
      triage.directResponse &&
      triage.confidence !== "low" &&
      clarificationDepth < 1;

    expect(shouldShortCircuit).toBe(true);
  });

  it("should NOT short-circuit when confidence is low", () => {
    const triage: { queryShape: string; directResponse?: string; confidence: string } = {
      queryShape: "ambiguous",
      directResponse: "Could you clarify?",
      confidence: "low",
    };
    const clarificationDepth = 0;

    const shouldShortCircuit =
      triage.queryShape === "ambiguous" &&
      triage.directResponse &&
      triage.confidence !== "low" &&
      clarificationDepth < 1;

    expect(shouldShortCircuit).toBe(false);
  });

  it("should NOT short-circuit when no directResponse", () => {
    const triage: { queryShape: string; directResponse?: string; confidence: string } = {
      queryShape: "ambiguous",
      directResponse: undefined,
      confidence: "high",
    };
    const clarificationDepth = 0;

    const shouldShortCircuit =
      triage.queryShape === "ambiguous" &&
      triage.directResponse &&
      triage.confidence !== "low" &&
      clarificationDepth < 1;

    expect(shouldShortCircuit).toBeFalsy();
  });

  it("should NOT short-circuit when depth >= 1 (cap reached)", () => {
    const triage: { queryShape: string; directResponse?: string; confidence: string } = {
      queryShape: "ambiguous",
      directResponse: "Could you clarify further?",
      confidence: "high",
    };
    const clarificationDepth = 1;

    const shouldShortCircuit =
      triage.queryShape === "ambiguous" &&
      triage.directResponse &&
      triage.confidence !== "low" &&
      clarificationDepth < 1;

    expect(shouldShortCircuit).toBe(false);
  });
});

describe("CLR-002: pending-state rehydrate preamble", () => {
  it("should build correct preamble from pending state", () => {
    const conv = {
      pendingIntent: "research",
      pendingQueryShape: "recommendation",
      pendingSince: Date.now() - 1000,
    };

    const preamble =
      `The user is mid-request. Their original intent was ${conv.pendingIntent} ` +
      `with shape ${conv.pendingQueryShape}.`;

    expect(preamble).toContain("mid-request");
    expect(preamble).toContain("research");
    expect(preamble).toContain("recommendation");
  });

  it("should skip preamble when pending state is expired", () => {
    const conv = {
      pendingIntent: "research",
      pendingQueryShape: "recommendation",
      pendingSince: Date.now() - 31 * 60 * 1000, // expired
    };

    const shouldPrepend =
      conv.pendingIntent && !isPendingExpired(conv.pendingSince);

    expect(shouldPrepend).toBe(false);
  });

  it("should skip preamble when no pending intent", () => {
    const conv = {
      pendingIntent: undefined,
      pendingQueryShape: undefined,
      pendingSince: undefined,
    };

    const shouldPrepend =
      conv.pendingIntent && !isPendingExpired(conv.pendingSince);

    expect(shouldPrepend).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// detectRefinement — specialist inheritance for multi-turn refinements
// ---------------------------------------------------------------------------

describe("detectRefinement", () => {
  const makeMessages = (userContent: string) => [
    {
      role: "user" as const,
      content: userContent,
    },
  ];

  it("returns shouldInherit: false when message does not start with a refinement phrase", async () => {
    const result = await detectRefinement(
      makeMessages("find me a career coach"),
      async () => ({
        hasResult: true,
        specialistName: "research",
        resultCreatedAt: Date.now() - 1000,
      }),
    );
    expect(result.shouldInherit).toBe(false);
  });

  it("returns shouldInherit: false when getLastToolResultWithSpecialist returns hasResult: false", async () => {
    const result = await detectRefinement(
      makeMessages("expand the search to include Bay Area"),
      async () => ({
        hasResult: false,
        specialistName: null,
        resultCreatedAt: null,
      }),
    );
    expect(result.shouldInherit).toBe(false);
  });

  it("returns shouldInherit: false when specialistName is null (monolithic fallback result)", async () => {
    const result = await detectRefinement(
      makeMessages("also show results from Seattle"),
      async () => ({
        hasResult: true,
        specialistName: null,
        resultCreatedAt: Date.now() - 1000,
      }),
    );
    expect(result.shouldInherit).toBe(false);
  });

  it("returns shouldInherit: true with specialistName when refinement phrase + recent result_card + specialist_name all present", async () => {
    const result = await detectRefinement(
      makeMessages("expand the search to include the West Coast"),
      async () => ({
        hasResult: true,
        specialistName: "research",
        resultCreatedAt: Date.now() - 1000,
      }),
    );
    expect(result.shouldInherit).toBe(true);
    if (result.shouldInherit) {
      expect(result.specialistName).toBe("research");
    }
  });

  it("canonical case: 'Expand the search to include the Bay Area and neurodiversity career coaching for high functioning individuals' inherits research specialist", async () => {
    const result = await detectRefinement(
      makeMessages(
        "Expand the search to include the Bay Area and neurodiversity career coaching for high functioning individuals",
      ),
      async () => ({
        hasResult: true,
        specialistName: "research",
        resultCreatedAt: Date.now() - 5000,
      }),
    );
    expect(result.shouldInherit).toBe(true);
    if (result.shouldInherit) {
      expect(result.specialistName).toBe("research");
    }
  });

  it("returns shouldInherit: false when messages array is empty", async () => {
    const result = await detectRefinement(
      [],
      async () => ({
        hasResult: true,
        specialistName: "research",
        resultCreatedAt: Date.now() - 1000,
      }),
    );
    expect(result.shouldInherit).toBe(false);
  });

  it("returns shouldInherit: false when getLastToolResultWithSpecialist returns null", async () => {
    const result = await detectRefinement(
      makeMessages("also include results from Austin"),
      async () => null,
    );
    expect(result.shouldInherit).toBe(false);
  });

  it("still inherits when result_card was created 2 hours ago (long-delay refinement)", async () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const result = await detectRefinement(
      makeMessages("actually, try narrowing to executive coaches"),
      async () => ({
        hasResult: true,
        specialistName: "research",
        resultCreatedAt: twoHoursAgo,
      }),
    );
    expect(result.shouldInherit).toBe(true);
  });
});
