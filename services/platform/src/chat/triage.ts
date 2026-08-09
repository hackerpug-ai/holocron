/**
 * Deterministic intent → specialist triage for chat runs.
 *
 * Replaces the 5-word divergent/convergent regex. Explicit specialist labels
 * win first (integration probe set); keyword heuristics cover natural phrasing.
 * Conversation / ambiguous intents fall through to knowledge so every message
 * lands on one of the 10 ported specialists (observable routing, UC-SVC-03).
 */
import { isSpecialistName, SPECIALIST_NAMES, type SpecialistName } from './specialists.ts';

export type IntentCategory =
  | 'conversation'
  | 'knowledge'
  | 'research'
  | 'podcast'
  | 'commerce'
  | 'subscriptions'
  | 'discovery'
  | 'documents'
  | 'analysis'
  | 'improvements'
  | 'multi_step';

export type TriageResult = {
  intent: IntentCategory;
  specialist: SpecialistName;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
};

/** Intent → specialist map (ported from convex/chat/specialists.ts). */
export const INTENT_TO_SPECIALIST: Record<IntentCategory, SpecialistName | null> = {
  conversation: null,
  knowledge: 'knowledge',
  research: 'research',
  podcast: 'podcast',
  commerce: 'commerce',
  subscriptions: 'subscriptions',
  discovery: 'discovery',
  documents: 'documents',
  analysis: 'analysis',
  improvements: 'improvements',
  multi_step: 'planner',
};

const EXPLICIT_LABEL =
  /\[specialist\s*[:=]\s*([a-z_]+)\]|specialist\s*[:=]\s*([a-z_]+)|#specialist-([a-z_]+)/i;

type Heuristic = {
  intent: IntentCategory;
  pattern: RegExp;
  label: string;
};

/** High-precision keyword map — first match wins. */
const HEURISTICS: Heuristic[] = [
  {
    intent: 'multi_step',
    pattern: /\b(create a plan|multi[- ]step|plan then|and then save|research .+ and save)\b/i,
    label: 'multi_step',
  },
  {
    intent: 'commerce',
    pattern: /\b(shop|shopping|buy|purchase|price|prices|product|products|retailer)\b/i,
    label: 'commerce',
  },
  {
    intent: 'subscriptions',
    pattern: /\b(subscribe|subscription|unsubscribe|feed|rss|newsletter source)\b/i,
    label: 'subscriptions',
  },
  {
    intent: 'discovery',
    pattern: /\b(what'?s new|whats new|trending|discover|news digest)\b/i,
    label: 'discovery',
  },
  {
    intent: 'documents',
    pattern: /\b(save (this )?document|update document|store (this )?doc|draft document)\b/i,
    label: 'documents',
  },
  {
    intent: 'analysis',
    pattern: /\b(assimilate|repo analysis|repository architecture|analyze (this )?repo)\b/i,
    label: 'analysis',
  },
  {
    intent: 'improvements',
    pattern: /\b(improvement request|feature request|add improvement|product improvement)\b/i,
    label: 'improvements',
  },
  {
    intent: 'podcast',
    pattern: /\b(podcast|episode|show notes|listen to)\b/i,
    label: 'podcast',
  },
  {
    intent: 'research',
    pattern: /\b(research|deep dive|web search|look up online|find recommendations?)\b/i,
    label: 'research',
  },
  {
    intent: 'knowledge',
    pattern:
      /\b(knowledge base|search (my )?docs|browse category|saved documents?|in my (kb|library))\b/i,
    label: 'knowledge',
  },
];

/**
 * Classify a user message into a specialist.
 * Pure / sync — triage must not call cloud providers.
 */
export function triageMessage(message: string): TriageResult {
  const text = message?.trim() ?? '';
  if (!text) {
    return {
      intent: 'conversation',
      specialist: 'knowledge',
      confidence: 'low',
      reasoning: 'empty message → knowledge default',
    };
  }

  const explicit = EXPLICIT_LABEL.exec(text);
  if (explicit) {
    const raw = (explicit[1] ?? explicit[2] ?? explicit[3] ?? '').toLowerCase();
    if (isSpecialistName(raw)) {
      return {
        intent: specialistToIntent(raw),
        specialist: raw,
        confidence: 'high',
        reasoning: `explicit specialist label: ${raw}`,
      };
    }
  }

  // Bare specialist name as a whole-word label (probe set).
  for (const name of SPECIALIST_NAMES) {
    const bare = new RegExp(`(?:^|[\\s:|#])${name}(?:$|[\\s:|#])`, 'i');
    if (bare.test(text) && text.toLowerCase().includes(name)) {
      // Only treat as label when the message is short/labelled, not prose about the word.
      if (text.length < 160 || /label(?:led)?|specialist|route|intent/i.test(text)) {
        return {
          intent: specialistToIntent(name),
          specialist: name,
          confidence: 'high',
          reasoning: `labelled probe for ${name}`,
        };
      }
    }
  }

  for (const h of HEURISTICS) {
    if (h.pattern.test(text)) {
      const specialist = INTENT_TO_SPECIALIST[h.intent] ?? 'knowledge';
      return {
        intent: h.intent,
        specialist,
        confidence: 'high',
        reasoning: `heuristic:${h.label}`,
      };
    }
  }

  return {
    intent: 'conversation',
    specialist: 'knowledge',
    confidence: 'low',
    reasoning: 'no specialist signal → knowledge default',
  };
}

function specialistToIntent(name: SpecialistName): IntentCategory {
  if (name === 'planner') return 'multi_step';
  return name;
}
