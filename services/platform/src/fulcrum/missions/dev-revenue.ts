/**
 * Mission #1 — the `dev-revenue` Fulcrum fitness contract (FUL-PLAT-005).
 *
 * Pure data. The operator edits THIS contract (or compiles a variant of it) to
 * steer the loop — no code change (UC-GATE-01). Compiling it appends versioned
 * ladder rows; a weight edit publishes version N+1 while version N stays
 * frozen (UC-LED-06).
 */
import type { FulcrumMissionContract } from '../contract.ts';

export const DEV_REVENUE_MISSION_ID = 'dev-revenue' as const;

export const devRevenueMissionContract: FulcrumMissionContract = {
  missionId: DEV_REVENUE_MISSION_ID,
  templateKey: 'evidence-research',
  instantiation: 'fulcrum',
  rootQuestion:
    'Which developer-tool niche can reach first paid revenue fastest on a self-owned inference stack?',
  disconfirmationMultiplier: 2,
  components: [
    {
      component: 'demand',
      kind: 'evidence',
      weight: 0.4,
      gradeFloor: 0.3,
      recencyWindowDays: 90,
      halfLifeDays: 45,
    },
    {
      component: 'competition',
      kind: 'evidence',
      weight: 0.2,
      gradeFloor: 0.2,
      recencyWindowDays: 180,
      halfLifeDays: 90,
    },
    {
      component: 'reachability',
      kind: 'evidence',
      weight: 0.2,
      gradeFloor: 0.2,
      recencyWindowDays: 120,
      halfLifeDays: 60,
    },
    {
      component: 'operator_judgment',
      kind: 'judgment',
      weight: 0.2,
    },
  ],
  domainTiers: [
    { registrableDomain: 'sec.gov', tier: 'primary', tierValue: 1.0 },
    { registrableDomain: 'irs.gov', tier: 'official', tierValue: 0.9 },
    { registrableDomain: 'arxiv.org', tier: 'academic', tierValue: 0.8 },
    { registrableDomain: 'acm.org', tier: 'academic', tierValue: 0.8 },
    { registrableDomain: 'github.com', tier: 'code', tierValue: 0.6 },
    { registrableDomain: 'news.ycombinator.com', tier: 'community', tierValue: 0.5 },
    { registrableDomain: 'medium.com', tier: 'blog', tierValue: 0.3 },
    { registrableDomain: 'reddit.com', tier: 'community', tierValue: 0.2 },
  ],
  sourceRules: {
    banList: ['contentfarm.example', 'seospam.example'],
    courtesyDelayMs: 1500,
  },
  cadence: { intervalMinutes: 15 },
  toolGrants: [
    'hybrid_search',
    'search_fts',
    'search_vector',
    'search_research',
    'get_research_session',
    'get_document',
  ],
};
