import { z } from 'zod';

const missionGoalArgsShape = {
  goal: z.string().min(1),
  operator: z.string().min(1).optional(),
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
