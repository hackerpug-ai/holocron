import { z } from 'zod';
import { EvidenceGateInputSchema } from '../research/evidence-gate';

const missionGoalArgsShape = {
  goal: z.string().min(1),
  operator: z.string().min(1).optional(),
  researchEvidence: EvidenceGateInputSchema.optional(),
  /** Research topic (CLI --topic); also used as the goal when --goal is omitted. */
  topic: z.string().min(1).optional(),
  /** Number of required research components to cover (CLI --components). */
  components: z.number().int().positive().max(64).optional(),
  /**
   * Operator-facing instantiation alias that selected the shared evidence-research
   * template (research | deepResearch | subscriptions-research | fulcrum).
   */
  instantiation: z
    .enum(['research', 'deepResearch', 'subscriptions-research', 'fulcrum'])
    .optional(),
  /** Free-form run tags persisted to mission_run_tags (includes instantiation). */
  tags: z.array(z.string().min(1)).max(16).optional(),
} as const;

export const MissionGoalArgsSchema = z.object(missionGoalArgsShape).strict();

export const MissionCreateArgsSchema = z
  .object({
    goal: missionGoalArgsShape.goal.optional(),
    operator: missionGoalArgsShape.operator,
  })
  .strict();

export type MissionGoalArgs = z.infer<typeof MissionGoalArgsSchema>;
export type MissionCreateArgs = z.infer<typeof MissionCreateArgsSchema>;
