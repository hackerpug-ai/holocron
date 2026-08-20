import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_ROOT = process.env.ROGUEONE_AGENT_ROOT;
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const ROSETTA_BLOCK = /<!--\s*rosetta-kb:begin[\s\S]*?<!--\s*rosetta-kb:end\s*-->/g;

type ProjectAgent = {
  readonly name: string;
  readonly systemPrompt: string;
  readonly tools: 'all';
  readonly description: string;
  readonly role: string;
  readonly knowledgeGraph?: unknown;
  readonly metadata: Record<string, unknown>;
};

type BrainSource = {
  readonly body: string;
  readonly path: string;
  readonly sha256: string;
};

function requireAgentRoot(): string {
  if (!AGENT_ROOT) {
    throw new Error(
      'holocron agent pack: ROGUEONE_AGENT_ROOT is unset; refusing to dispatch project agents without their Brain source prompts.'
    );
  }
  return AGENT_ROOT;
}

function readBrainSource(name: string): BrainSource {
  const path = join(requireAgentRoot(), 'agents', name, 'agent.md');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`holocron agent pack: cannot read Brain agent '${name}' at ${path}`, {
      cause,
    });
  }
  const body = raw.replace(FRONTMATTER, '').trim();
  if (body.length === 0) {
    throw new Error(`holocron agent pack: Brain agent '${name}' has an empty system prompt`);
  }
  return {
    body,
    path,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}

function readMastraGraph(): {
  readonly graph: unknown;
  readonly path: string;
  readonly sha256: string;
} {
  const path = join(requireAgentRoot(), '.rosetta', 'docs', 'mastra', 'fact-graph.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`holocron agent pack: cannot read the Mastra fact graph at ${path}`, { cause });
  }
  let graph: unknown;
  try {
    graph = JSON.parse(raw);
  } catch (cause) {
    throw new Error(`holocron agent pack: Mastra fact graph is invalid JSON at ${path}`, { cause });
  }
  return {
    graph,
    path,
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
}

const HOLOCRON_DOCTRINE = `
---

# PROJECT OVERRIDE — Holocron

Read AGENTS.md before touching a file. Its current project rules override generic guidance above.

## Platform boundary

- New backend and agentic work targets Mastra on Bun, Postgres and Drizzle, with Zero serving the React Native client. Convex and pi-agent code are migration sources only unless the task explicitly says otherwise.
- Reasoning uses the real local LiteLLM fleet. Claude is a budgeted escape hatch, never a fabricated substitute.
- Never disconnect Wi-Fi, alter interfaces, or simulate failure by disrupting the host network.

## Real proof

- Stubs, mocked core services, canned responses, fake success, skipped required behavior and test-only transports do not satisfy a task.
- Exercise the real server, database, HTTP or stdio boundary, fleet route, filesystem and simulator required by the task. If a dependency is unavailable, fail closed with the exact evidence.
- Use the repository's Vitest lanes. Unit tests are supplemental; integration and live behavior require their real dependencies.
- Scan touched production code and tests for TODO deferrals, skips, placeholders and no-op success paths before reporting completion.

## Loop contract

- Work only in the assigned task worktree and branch. Do not merge, push main, switch to main, remove worktrees or delete task branches.
- Preserve unrelated and pre-existing work. Do not edit or stage existing .tmp evidence unless the task explicitly owns it.
- Run the task's declared tests and relevant project gates, commit the validated change on the task branch, report the commit SHA, then stop. Never bypass hooks.
- Secret values never enter source, prompts, logs, argv, receipts or evidence. Use credential names only and load operator-approved local sources when the task requires them.
`.trim();

function projectPrompt(body: string): string {
  return `${body}\n\n${HOLOCRON_DOCTRINE}\n`;
}

function shadow(name: string, role: string, description: string): ProjectAgent {
  const source = readBrainSource(name);
  return {
    name,
    systemPrompt: projectPrompt(source.body),
    tools: 'all',
    description,
    role,
    metadata: {
      project: 'holocron',
      brain_source_profile: source.path,
      brain_source_sha256: source.sha256,
    },
  };
}

const mastraGraph = readMastraGraph();

function mastra(name: string, role: string, description: string): ProjectAgent {
  const source = readBrainSource(name);
  ROSETTA_BLOCK.lastIndex = 0;
  if (!ROSETTA_BLOCK.test(source.body)) {
    throw new Error(
      `holocron agent pack: '${name}' has no embedded Mastra Rosetta block; refusing to duplicate or silently lose its knowledge graph.`
    );
  }
  ROSETTA_BLOCK.lastIndex = 0;
  const prompt = source.body
    .replace(ROSETTA_BLOCK, '')
    .replace(/^##\s*=== ROSETTA KNOWLEDGE BASE[^\n]*\n/gm, '')
    .replace(/^##\s*=== END ROSETTA KB ===\s*$/gm, '')
    .replace(/^_[^\n]*knowledge block above[^\n]*_\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    name,
    systemPrompt: projectPrompt(prompt),
    tools: 'all',
    description,
    role,
    knowledgeGraph: mastraGraph.graph,
    metadata: {
      project: 'holocron',
      brain_source_profile: source.path,
      brain_source_sha256: source.sha256,
      brain_knowledge_graph: mastraGraph.path,
      brain_knowledge_graph_sha256: mastraGraph.sha256,
    },
  };
}

const designerSource = readBrainSource('frontend-designer');

const DESIGN_REVIEW_MODE = `
---

# REVIEW MODE

Judge the rendered Holocron surface; do not implement it. Apply the frontend-designer system prompt as the review standard. Inspect real screenshots or a real simulator/browser surface when the task changes presentation. Report only evidence-backed findings with file and line, violated project rule, observed result and required correction. Verify semantic tokens, Paper Text usage, accessibility, ScreenLayout on drawer routes, interactive test IDs, co-located stories and light/dark behavior.
`.trim();

function designerVariant(
  name: string,
  role: string,
  mode: string,
  description: string
): ProjectAgent {
  return {
    name,
    systemPrompt: projectPrompt(`${designerSource.body}\n\n${mode}`),
    tools: 'all',
    description,
    role,
    metadata: {
      project: 'holocron',
      brain_source_profile: designerSource.path,
      brain_source_sha256: designerSource.sha256,
    },
  };
}

export const agents: ProjectAgent[] = [
  shadow(
    'mcp-implementer',
    'implementer',
    'Holocron MCP implementation with real HTTP and stdio protocol proof.'
  ),
  shadow(
    'mcp-reviewer',
    'reviewer',
    'Holocron MCP protocol, schema, transport and real-service review.'
  ),
  mastra(
    'mastra-implementer',
    'implementer',
    'Holocron MK-VI Mastra, Postgres, Drizzle, fleet and mission-engine implementation.'
  ),
  mastra(
    'mastra-reviewer',
    'reviewer',
    'Holocron MK-VI Mastra review with stub detection and real-service evidence.'
  ),
  mastra(
    'mastra-evals-implementer',
    'implementer',
    'Holocron evals, live scoring, drift detection and observability implementation.'
  ),
  shadow(
    'convex-implementer',
    'migration-implementer',
    'Read-side Convex extraction and cutover support only; no new Convex features.'
  ),
  shadow(
    'convex-reviewer',
    'migration-reviewer',
    'Review completeness of the Convex export and MK-VI migration source.'
  ),
  shadow(
    'pi-agent-implementer',
    'migration-implementer',
    'Legacy pi-agent reference work only when an explicit migration task requires it.'
  ),
  shadow(
    'pi-agent-reviewer',
    'migration-reviewer',
    'Legacy pi-agent migration-source review only.'
  ),
  shadow(
    'react-native-ui-implementer',
    'implementer',
    'Holocron Expo and React Native implementation over Zero reactive state.'
  ),
  shadow(
    'react-native-ui-reviewer',
    'reviewer',
    'Holocron Expo, Zero, theme, accessibility and real-simulator review.'
  ),
  designerVariant(
    'frontend-designer',
    'implementer',
    '# BUILD MODE\n\nBuild the rendered surface using Holocron semantic tokens and existing components. Verify it on a real target.',
    'Holocron visual implementation using the project design system.'
  ),
  designerVariant(
    'frontend-designer-reviewer',
    'reviewer',
    DESIGN_REVIEW_MODE,
    'The same frontend design specialist operating in evidence-based review mode.'
  ),
  shadow(
    'code-reviewer',
    'reviewer',
    'Holocron fallback code review with project rules and real-test evidence.'
  ),
  shadow(
    'integrator',
    'maintainer',
    'Holocron governed integration identity; landing remains owned by the RogueOne spine.'
  ),
];

export default agents;
