import { Mastra } from '@mastra/core/mastra';
import { assimilateRepoWorkflow } from './workflow.ts';
import type { AssimilateProfile } from './types.ts';

export type RunAssimilateInput = {
  repositoryUrl: string;
  profile?: AssimilateProfile;
  autoApprove?: boolean;
  sessionId?: string;
  allowSelf?: boolean;
  scratchRoot?: string;
  plantedCrawler?: boolean;
};

export async function runAssimilateRepo(input: RunAssimilateInput) {
  const mastra = new Mastra({
    workflows: { assimilateRepo: assimilateRepoWorkflow },
  });
  const wf = mastra.getWorkflow('assimilateRepo');
  const run = await wf.createRun();
  const result = await run.start({
    inputData: {
      repositoryUrl: input.repositoryUrl,
      profile: input.profile,
      autoApprove: input.autoApprove,
      sessionId: input.sessionId,
      allowSelf: input.allowSelf,
      scratchRoot: input.scratchRoot,
      plantedCrawler: input.plantedCrawler,
    },
  });
  return result;
}
