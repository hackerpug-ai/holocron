export const DEDUP_SYSTEM_PROMPT = `You are a deduplication classifier for a product improvement request system.

Your job is to decide whether a new improvement request is a duplicate of an existing one or is genuinely new.

## Response Format

Return ONLY a JSON object — no markdown, no explanation:

{
  "action": "create_new" | "merge",
  "mergeTargetId": "<existing request ID — only when action is merge>",
  "confidence": <number between 0 and 1>,
  "reasoning": "<one sentence explaining the decision>",
  "title": "<5-10 word concise title for the request>",
  "summary": "<1-2 sentences describing what the user wants>"
}

## Decision Rules

1. Two requests are the SAME if they describe the same underlying problem or desired outcome, even with different wording.
2. Two requests are DIFFERENT if they describe distinct problems, different failure modes, or unrelated outcomes — even if they share a topic.
3. When unsure, choose "create_new" with lower confidence (below 0.6).
4. Only choose "merge" when confidence is 0.7 or higher.
5. Use the highest-scoring candidate as the merge target when merging.

## Examples

SAME (merge):
- "dark mode toggle is hard to find" + "can't locate dark mode setting" → same problem: discoverability of dark mode
- "app crashes when I open a PDF" + "PDF viewer keeps closing unexpectedly" → same problem: PDF crash

DIFFERENT (create_new):
- "dark mode toggle is hard to find" + "dark mode toggle looks ugly" → different: discoverability vs. aesthetics
- "dark mode toggle is hard to find" + "dark mode doesn't save between sessions" → different: discoverability vs. persistence
- "app crashes on PDF open" + "PDF text is blurry" → different: crash vs. rendering quality

## Title Guidelines

- 5-10 words maximum
- Describe the problem or desired feature, not the user's phrasing
- Use plain language, no jargon
- Examples: "Dark mode setting hard to discover", "PDF viewer crashes on open"

## Summary Guidelines

- 1-2 sentences maximum
- Capture what the user wants or what is broken
- Neutral tone, no editorial language`;

type DedupCandidate = {
  _id: string;
  title?: string;
  description?: string;
  score: number;
};

export const buildUserPrompt = (
  description: string,
  candidates: DedupCandidate[],
  userFeedback?: string,
): string => {
  const candidatesSection =
    candidates.length === 0
      ? "None found."
      : candidates
          .map((c, i) => {
            const title = c.title ?? "(no title)";
            const snippet =
              c.description != null && c.description.length > 0
                ? c.description.slice(0, 200) + (c.description.length > 200 ? "..." : "")
                : "(no description)";
            return `${i + 1}. ID: ${c._id}\n   Title: ${title}\n   Description: ${snippet}\n   Similarity score: ${c.score.toFixed(3)}`;
          })
          .join("\n\n");

  const feedbackSection =
    userFeedback != null && userFeedback.trim().length > 0
      ? `\n## User Feedback on Previous Classification\n\n${userFeedback.trim()}\n\nRe-evaluate your decision in light of this feedback.`
      : "";

  return `## New Improvement Request

${description.trim()}

## Top Similar Existing Requests

${candidatesSection}${feedbackSection}

Classify this request and return a JSON object.`;
};
