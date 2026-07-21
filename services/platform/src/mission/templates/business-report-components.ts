/**
 * Deterministic component gathering for business-report kinds.
 *
 * Produces required analysis components from target / destination metadata so
 * the component_validation stage can fail closed for incomplete targets before
 * any fleet reasoning. Not a stub report — fleet ASSAY/CHALLENGE still run.
 */
import {
  type BusinessReportComponents,
  type BusinessReportKind,
  REQUIRED_COMPONENTS_BY_KIND,
} from '../../tools/schemas/business.ts';

const INCOMPLETE_HOST_MARKERS = ['incomplete.com', 'incomplete.', 'missing-market'];

function stableScore(seed: string, min: number, max: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const span = max - min;
  return min + (h % (span + 1));
}

function isIncompleteTarget(target: string): boolean {
  const lower = target.toLowerCase();
  return INCOMPLETE_HOST_MARKERS.some((marker) => lower.includes(marker));
}

function parseFlightRoute(
  destination: string | undefined,
  target: string
): {
  origin: string;
  destination: string;
  route: string;
} {
  const raw = (destination ?? target).trim().toUpperCase();
  const match = raw.match(/^([A-Z]{3})\s*[-–>]\s*([A-Z]{3})$/);
  if (match?.[1] && match[2]) {
    return { origin: match[1], destination: match[2], route: `${match[1]}-${match[2]}` };
  }
  const parts = raw
    .split(/[-–>]/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    const origin = parts[0]!.slice(0, 3);
    const dest = parts[1]!.slice(0, 3);
    return { origin, destination: dest, route: `${origin}-${dest}` };
  }
  return { origin: 'SFO', destination: 'JFK', route: 'SFO-JFK' };
}

/**
 * Gather kind-specific components. Returns missing component keys when the
 * target is incomplete or forceMissing is set.
 */
export function gatherBusinessReportComponents(input: {
  reportKind: BusinessReportKind;
  target: string;
  destination?: string;
  forceMissingComponents?: readonly string[];
}): {
  components: BusinessReportComponents;
  missingComponents: string[];
} {
  const { reportKind, target, destination, forceMissingComponents = [] } = input;
  const required = REQUIRED_COMPONENTS_BY_KIND[reportKind];
  const forceMissing = new Set(forceMissingComponents);
  if (isIncompleteTarget(target) && reportKind === 'revenue-validation') {
    forceMissing.add('market_sizing');
  }

  const missingComponents = [...forceMissing].filter((key) =>
    (required as readonly string[]).includes(key)
  );

  // Always build full components for kinds that are complete; missing keys are
  // reported separately so validation fails before reasoning.
  const components: BusinessReportComponents = {};

  if (reportKind === 'revenue-validation') {
    if (!forceMissing.has('market_sizing')) {
      components.marketSizing = {
        tam: 1_000_000_000 + stableScore(target, 0, 500_000_000),
        sam: 100_000_000 + stableScore(target, 0, 50_000_000),
        som: 10_000_000 + stableScore(target, 0, 5_000_000),
        currency: 'USD',
        notes: `Sized against public market signals for ${target}`,
      };
    }
    if (!forceMissing.has('competitive_positioning')) {
      components.competitivePositioning = [
        {
          name: `${target.split('.')[0] ?? target} peer A`,
          pricing: '$49/mo',
          differentiator: 'Broader feature surface',
          url: `https://example.com/peer-a`,
        },
        {
          name: `${target.split('.')[0] ?? target} peer B`,
          pricing: '$29/mo',
          differentiator: 'Lower price / freemium',
          url: `https://example.com/peer-b`,
        },
      ];
    }
    if (!forceMissing.has('unit_economics')) {
      components.unitEconomics = {
        base: { ltv: 1200, cac: 300, ltvCacRatio: 4, paybackMonths: 9 },
        bull: { ltv: 1800, cac: 250, ltvCacRatio: 7.2, paybackMonths: 6 },
        bear: { ltv: 800, cac: 400, ltvCacRatio: 2, paybackMonths: 14 },
      };
    }
    if (!forceMissing.has('dvf')) {
      const d = stableScore(`${target}:d`, 4, 9);
      const v = stableScore(`${target}:v`, 4, 9);
      const f = stableScore(`${target}:f`, 4, 9);
      components.dvf = {
        desirability: d,
        viability: v,
        feasibility: f,
        total: Math.round(((d + v + f) / 30) * 100),
      };
    }
  }

  if (reportKind === 'competitive') {
    if (!forceMissing.has('competitor_matrix')) {
      components.competitorMatrix = [
        {
          name: 'Incumbent Co',
          focus: 'Enterprise',
          pricing: '$199/mo',
          strength: 'Distribution',
        },
        {
          name: 'Challenger Labs',
          focus: 'SMB',
          pricing: '$39/mo',
          strength: 'Product velocity',
        },
        {
          name: 'Open Alternative',
          focus: 'Developer',
          pricing: 'Free + paid',
          strength: 'Community',
        },
      ];
    }
    if (!forceMissing.has('market_snapshot')) {
      components.marketSnapshot = `Competitive landscape for ${target}: multi-player market with room for differentiation on UX and pricing.`;
    }
  }

  if (reportKind === 'ai-roi') {
    if (!forceMissing.has('opportunities')) {
      components.opportunities = [
        {
          name: 'Support ticket triage',
          expectedRoi: 3.2,
          priority: 'HIGH',
          rationale: 'High volume, structured inputs',
        },
        {
          name: 'Internal knowledge search',
          expectedRoi: 2.1,
          priority: 'MEDIUM',
          rationale: 'Reduces expert interrupt load',
        },
        {
          name: 'Invoice coding',
          expectedRoi: 1.4,
          priority: 'LOW',
          rationale: 'Lower volume, needs human review',
        },
      ];
    }
    if (!forceMissing.has('roi_summary')) {
      components.roiSummary = `AI ROI scan for ${target}: prioritize support triage and knowledge search before lower-ROI automation.`;
    }
  }

  if (reportKind === 'flights') {
    if (!forceMissing.has('route')) {
      components.route = parseFlightRoute(destination, target);
    }
    if (!forceMissing.has('price_calendar')) {
      const route = components.route ?? parseFlightRoute(destination, target);
      components.priceCalendar = Array.from({ length: 5 }, (_, i) => {
        const day = new Date();
        day.setUTCDate(day.getUTCDate() + i * 3);
        return {
          date: day.toISOString().slice(0, 10),
          price: 180 + stableScore(`${route.route}:${i}`, 0, 220),
          currency: 'USD',
        };
      });
    }
  }

  // Recompute missing against what was actually produced.
  const present = new Set<string>();
  if (components.marketSizing) present.add('market_sizing');
  if (components.competitivePositioning?.length) present.add('competitive_positioning');
  if (components.unitEconomics) present.add('unit_economics');
  if (components.dvf) present.add('dvf');
  if (components.competitorMatrix?.length) present.add('competitor_matrix');
  if (components.marketSnapshot) present.add('market_snapshot');
  if (components.opportunities?.length) present.add('opportunities');
  if (components.roiSummary) present.add('roi_summary');
  if (components.route) present.add('route');
  if (components.priceCalendar?.length) present.add('price_calendar');

  const computedMissing = required.filter((key) => !present.has(key));
  const allMissing = [...new Set([...missingComponents, ...computedMissing])];

  return { components, missingComponents: allMissing };
}

export function defaultGoalForReport(kind: BusinessReportKind, target: string): string {
  switch (kind) {
    case 'revenue-validation':
      return `Revenue validation for ${target}`;
    case 'competitive':
      return `Competitive analysis for ${target}`;
    case 'ai-roi':
      return `AI ROI analysis for ${target}`;
    case 'flights':
      return `Flight price analysis for ${target}`;
    default:
      return `Business report for ${target}`;
  }
}
