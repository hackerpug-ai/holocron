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
  readonly harness?: AgentTarget['harness'];
  readonly provider?: string;
  readonly model?: string;
  readonly knowledgeGraph?: unknown;
  readonly metadata: Record<string, unknown>;
};

type AgentTarget = {
  readonly harness: 'claude-code' | 'codex' | 'opencode' | 'grok' | 'pi';
  readonly provider: string;
  readonly model: string;
};

/**
 * The only model-routing knobs for project agents.
 *
 * Keep these in the project agent pack so changing a harness/provider/model
 * assignment does not require editing every agent or the dispatch config.
 * The RogueOne config imports these values only because its schema requires
 * role targets to be present there as well.
 *
 * On the `pi` harness the bridge cannot switch models mid-session (pi-acp does
 * not implement ACP `session/set_model`), so the model is selected at pi boot
 * via `pi --mode rpc --model "$ROGUEONE_PI_MODEL"`. `model` must therefore be
 * a real pi identifier in `provider/model` form — check with `pi models`.
 * RogueOne itself treats provider and model as passthrough strings and only
 * enforces non-empty; a bad identifier fails at the ACP agent, not here.
 */
export const IMPLEMENTER_TARGET: AgentTarget = {
  harness: 'pi',
  provider: 'zai',
  model: 'zai/glm-5.3-flash',
};

export const REVIEWER_TARGET: AgentTarget = {
  harness: 'pi',
  provider: 'openai-codex',
  model: 'openai-codex/gpt-5.6-terra',
};

function targetForRole(role: string): AgentTarget | undefined {
  if (role === 'implementer' || role === 'migration-implementer') {
    return IMPLEMENTER_TARGET;
  }
  if (role === 'reviewer' || role === 'migration-reviewer') {
    return REVIEWER_TARGET;
  }
  return undefined;
}

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

type KnowledgeGraph = {
  readonly graph: unknown;
  readonly path: string;
  readonly sha256: string;
  /** Non-wire top-level keys folded into `w` to satisfy the host schema. */
  readonly folded: readonly string[];
};

const graphCache = new Map<string, KnowledgeGraph>();

/**
 * Top-level keys the RogueOne host accepts in the passive fact-graph wire
 * format (see its FactGraphSchema). Any other top-level key makes the WHOLE
 * project config invalid, with `config_invalid` as the only diagnostic.
 */
const WIRE_KEYS = new Set(['v', 'w', 'r', 'a', 'x', 't', '_meta']);

/**
 * Fold non-wire top-level blocks into `w` so a KB that carries extra sections
 * still validates. Lossless on purpose: dropping them would silently delete
 * real domain knowledge (the trpc graph's `patterns` block, for instance,
 * catalogues its per-runtime adapter examples). Throws on collision rather
 * than overwriting.
 */
function conformGraph(domain: string, parsed: Record<string, unknown>): Record<string, unknown> {
  const extra = Object.keys(parsed).filter((key) => !WIRE_KEYS.has(key));
  if (extra.length === 0) return parsed;
  const w: Record<string, unknown> = { ...((parsed.w as Record<string, unknown>) ?? {}) };
  for (const key of extra) {
    const folded = `${key} (folded from a non-wire top-level block)`;
    if (folded in w) {
      throw new Error(
        `holocron agent pack: '${domain}' fact graph cannot fold '${key}' — '${folded}' already exists in w.`
      );
    }
    w[folded] = parsed[key];
  }
  const conformed: Record<string, unknown> = { ...parsed, w };
  for (const key of extra) delete conformed[key];
  return conformed;
}

/**
 * Read one Rosetta domain's fact graph from the Brain root.
 *
 * Cached per domain: an implementer and its reviewer share a domain, and the
 * graphs are large enough that re-reading and re-hashing per agent is waste.
 */
function readGraph(domain: string): KnowledgeGraph {
  const cached = graphCache.get(domain);
  if (cached) return cached;
  const path = join(requireAgentRoot(), '.rosetta', 'docs', domain, 'fact-graph.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new Error(`holocron agent pack: cannot read the '${domain}' fact graph at ${path}`, {
      cause,
    });
  }
  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(raw) as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`holocron agent pack: '${domain}' fact graph is invalid JSON at ${path}`, {
      cause,
    });
  }
  const folded = Object.keys(graph).filter((key) => !WIRE_KEYS.has(key));
  const entry: KnowledgeGraph = {
    graph: conformGraph(domain, graph),
    path,
    folded,
    // Hash the raw file, not the conformed shape: provenance points at the
    // Brain source on disk.
    sha256: createHash('sha256').update(raw).digest('hex'),
  };
  graphCache.set(domain, entry);
  return entry;
}

const HOLOCRON_DOCTRINE = `
---

# PROJECT OVERRIDE — Holocron

Read AGENTS.md before touching a file. Its current project rules override generic guidance above.

## Platform boundary

- Device platform: Mastra on Bun, Postgres and Drizzle, with Zero serving the React Native client.
- Web client: Next.js on Cloudflare Workers, tRPC as the BFF, shadcn and AI Elements for UI, an AI SDK agent loop attaching to the device MCP gateway over the tunnel, and BetterAuth guarding the operator surface. Scoped in docs/plans/webclient-design-brief.md — read it before touching web client code.
- Cloudflare's default Next.js path is vinext, not OpenNext. Reject Vercel-only deploys and adapterless next start when the target is Workers. Bindings are server-only: import env from cloudflare:workers, never from a Client Component. Image optimization is partial, so the public reader serves document assets from the origin asset route rather than relying on it.
- shadcn and AI Elements are Open Code, not importable packages. Their CLIs copy source into this repo; edit the copies. An import from an npm component package named for either library is wrong by construction.
- Convex is decommissioned. Two build gates enforce it: verify:no-convex-client and verify-no-convex-env. Never add Convex code, imports or env aliases.
- Public share links target docs.holocrnlib.com/d/<token>. That URL shape is promised by the MCP share_document tool description and must stay stable, including its 60s cache and revocation semantics.
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
  const target = targetForRole(role);
  return {
    name,
    systemPrompt: projectPrompt(source.body),
    tools: 'all',
    description,
    role,
    ...(target ?? {}),
    metadata: {
      project: 'holocron',
      brain_source_profile: source.path,
      brain_source_sha256: source.sha256,
      ...(target ?? {}),
    },
  };
}

/**
 * A Brain agent whose embedded Rosetta block is lifted out of the prompt and
 * passed structurally as `knowledgeGraph`. Fails closed when the block is
 * missing rather than silently shipping an agent with no domain knowledge.
 */
function graphed(name: string, role: string, domain: string, description: string): ProjectAgent {
  const source = readBrainSource(name);
  const target = targetForRole(role);
  const kb = readGraph(domain);
  ROSETTA_BLOCK.lastIndex = 0;
  if (!ROSETTA_BLOCK.test(source.body)) {
    throw new Error(
      `holocron agent pack: '${name}' has no embedded '${domain}' Rosetta block; refusing to duplicate or silently lose its knowledge graph.`
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
    ...(target ?? {}),
    knowledgeGraph: kb.graph,
    metadata: {
      project: 'holocron',
      brain_source_profile: source.path,
      brain_source_sha256: source.sha256,
      brain_knowledge_domain: domain,
      brain_knowledge_graph: kb.path,
      brain_knowledge_graph_sha256: kb.sha256,
      ...(kb.folded.length > 0 ? { brain_knowledge_graph_folded: kb.folded } : {}),
      ...(target ?? {}),
    },
  };
}

const designerSource = readBrainSource('frontend-designer');

const DESIGN_REVIEW_MODE = `
---

# REVIEW MODE

Judge the rendered Holocron surface; do not implement it. Apply the frontend-designer system prompt as the review standard. Inspect real screenshots or a real simulator/browser surface when the task changes presentation. Report only evidence-backed findings with file and line, violated project rule, observed result and required correction.

Always verify: semantic tokens over literal values, accessibility, interactive test IDs, co-located stories, and light/dark behavior.

On the React Native surface also verify Paper Text usage and ScreenLayout on drawer routes.

On the web surface also verify the chrome-vs-column rule: identity (glow, depth, crystalline geometry, motion) belongs to nav, cards, chat frames and state transitions; any reading column past roughly 500 words stays calm and high contrast, with no chrome inside the measure. Public /d/<token> pages carry identity only in the header and edges.
`.trim();

function designerVariant(
  name: string,
  role: string,
  mode: string,
  description: string
): ProjectAgent {
  const target = targetForRole(role);
  return {
    name,
    systemPrompt: projectPrompt(`${designerSource.body}\n\n${mode}`),
    tools: 'all',
    description,
    role,
    ...(target ?? {}),
    metadata: {
      project: 'holocron',
      brain_source_profile: designerSource.path,
      brain_source_sha256: designerSource.sha256,
      ...(target ?? {}),
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
  graphed(
    'mastra-implementer',
    'implementer',
    'mastra',
    'Holocron MK-VI Mastra, Postgres, Drizzle, fleet and mission-engine implementation.'
  ),
  graphed(
    'mastra-reviewer',
    'reviewer',
    'mastra',
    'Holocron MK-VI Mastra review with stub detection and real-service evidence.'
  ),
  graphed(
    'mastra-evals-implementer',
    'implementer',
    'mastra',
    'Holocron evals, live scoring, drift detection and observability implementation.'
  ),
  graphed(
    'nextjs-implementer',
    'implementer',
    'nextjs',
    'Holocron web client: Server Components, route handlers and the public /d/<token> reader.'
  ),
  graphed(
    'nextjs-reviewer',
    'reviewer',
    'nextjs',
    'Holocron web client review: Server/Client boundary, data fetching, caching and security.'
  ),
  graphed(
    'trpc-implementer',
    'implementer',
    'trpc',
    'Holocron BFF: routers, procedures, streaming generators and TanStack Query wiring.'
  ),
  graphed(
    'trpc-reviewer',
    'reviewer',
    'trpc',
    'Holocron BFF review: type safety, Zod validation, link correctness and stream lifecycle.'
  ),
  graphed(
    'cloudflare-workers-implementer',
    'implementer',
    'cloudflare-workers',
    'Holocron edge deployment: Wrangler config, bindings and the public reader cache semantics.'
  ),
  graphed(
    'cloudflare-workers-reviewer',
    'reviewer',
    'cloudflare-workers',
    'Holocron edge review: bindings, CPU and size limits, cache correctness and revocation SLA.'
  ),
  graphed(
    'aisdk-implementer',
    'implementer',
    'ai-sdk',
    'Holocron web agent loop against a REAL provider stream and the device MCP gateway.'
  ),
  graphed(
    'aisdk-reviewer',
    'reviewer',
    'ai-sdk',
    'Holocron web agent review: v7 correctness, real-provider verification and stub detection.'
  ),
  graphed(
    'shadcn-ai-elements-implementer',
    'implementer',
    'shadcn-ai-elements',
    'Holocron web UI: real shadcn and AI Elements CLI installs, edited in place, over a real stream.'
  ),
  graphed(
    'shadcn-ai-elements-reviewer',
    'reviewer',
    'shadcn-ai-elements',
    'Holocron web UI review: Open Code installs, registry drift, chat composition and real-stream evidence.'
  ),
  graphed(
    'betterauth-implementer',
    'implementer',
    'betterauth',
    'Holocron operator auth: config, handler mounting, Drizzle migrations and client instance.'
  ),
  graphed(
    'betterauth-reviewer',
    'reviewer',
    'betterauth',
    'Holocron auth review: session security, handler mounting, token handling and migrations.'
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
