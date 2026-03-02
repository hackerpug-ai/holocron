import type { Meta, StoryObj } from '@storybook/react'
import { ResearchResultScreen } from './ResearchResultScreen'

const meta = {
  title: 'Screens/ResearchResultScreen',
  component: ResearchResultScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ResearchResultScreen>

export default meta
type Story = StoryObj<typeof meta>

const sampleSummary = `Large Language Models (LLMs) have revolutionized natural language processing through their ability to understand and generate human-like text. This research explores the fundamental mechanisms that enable these capabilities.

Key findings include:

1. **Attention Mechanisms**: The self-attention mechanism allows models to weigh the importance of different parts of the input, enabling context-aware processing.

2. **Scale and Emergence**: As models increase in size, they exhibit emergent capabilities - abilities that appear suddenly rather than gradually improving.

3. **Training Paradigms**: Modern LLMs use a two-phase approach: unsupervised pre-training on large text corpora followed by supervised fine-tuning for specific tasks.

4. **Context Windows**: Recent advances have extended context windows from thousands to millions of tokens, enabling processing of entire documents.

The research indicates that while current models are impressive, significant challenges remain in areas such as factual accuracy, reasoning, and alignment with human values.`

const mockIterations = [
  {
    iterationNumber: 1,
    coverageScore: 2,
    feedback: 'Initial search covered basic concepts but missed recent developments in context extension and efficiency improvements.',
    refinedQueries: [
      'LLM context window extension techniques 2024',
      'Mixture of experts architecture efficiency',
      'Constitutional AI alignment methods',
    ],
    isComplete: true,
  },
  {
    iterationNumber: 2,
    coverageScore: 3,
    feedback: 'Better coverage of recent techniques. Need more depth on training methodologies and emergent capabilities.',
    refinedQueries: [
      'RLHF training process detailed',
      'Emergent capabilities in language models scale',
      'Instruction tuning vs fine-tuning comparison',
    ],
    isComplete: true,
  },
  {
    iterationNumber: 3,
    coverageScore: 4,
    feedback: 'Good coverage achieved. Minor gap in discussion of multimodal extensions.',
    refinedQueries: [
      'Vision language models architecture',
      'Multimodal LLM capabilities',
    ],
    isComplete: true,
  },
  {
    iterationNumber: 4,
    coverageScore: 5,
    feedback: 'Comprehensive coverage achieved across all key topics.',
    isComplete: true,
  },
]

const mockSources = [
  'arxiv.org',
  'openai.com',
  'anthropic.com',
  'huggingface.co',
  'github.com',
  'neurips.cc',
  'deepmind.com',
]

const mockRelatedArticles = [
  {
    id: '1',
    title: 'Introduction to Transformers',
    category: 'academic' as const,
    date: '2026-02-20T10:00:00Z',
    snippet: 'A foundational overview of the transformer architecture.',
  },
  {
    id: '2',
    title: 'RLHF Explained',
    category: 'research' as const,
    date: '2026-02-15T14:30:00Z',
    snippet: 'Deep dive into Reinforcement Learning from Human Feedback.',
  },
]

export const Default: Story = {
  args: {
    title: 'How do Large Language Models work?',
    category: 'deep-research',
    date: '2026-02-28T10:30:00Z',
    summary: sampleSummary,
    elapsedTime: 240,
    iterations: mockIterations,
    sources: mockSources,
    relatedArticles: mockRelatedArticles,
  },
}

export const QuickResearch: Story = {
  args: {
    title: 'What is the current state of quantum computing?',
    category: 'research',
    date: '2026-02-27T15:00:00Z',
    summary: 'Quantum computing is progressing rapidly with IBM, Google, and startups achieving milestones in qubit count and error correction. Current systems have 100-1000+ qubits but remain in the NISQ (Noisy Intermediate-Scale Quantum) era.',
    elapsedTime: 45,
    sources: ['ibm.com', 'google.com', 'nature.com'],
    relatedArticles: [],
  },
}

export const FactCheck: Story = {
  args: {
    title: 'Is GraphQL always better than REST?',
    category: 'factual',
    date: '2026-02-26T09:15:00Z',
    summary: 'No. GraphQL and REST each have trade-offs. GraphQL excels at reducing over-fetching and enabling flexible queries, but REST is simpler, has better caching, and is more suitable for simple CRUD operations.',
    elapsedTime: 30,
    sources: ['graphql.org', 'developer.mozilla.org', 'stackoverflow.com'],
  },
}

export const SingleIteration: Story = {
  args: {
    title: 'React Native vs Flutter: Performance comparison',
    category: 'research',
    date: '2026-02-25T11:45:00Z',
    summary: 'Both frameworks offer near-native performance for most use cases. Flutter compiles to native code while React Native uses a bridge. For computationally intensive apps, Flutter has a slight edge, but React Native is catching up with the new architecture.',
    elapsedTime: 90,
    iterations: [
      {
        iterationNumber: 1,
        coverageScore: 4,
        feedback: 'Good coverage of performance characteristics.',
        isComplete: true,
      },
    ],
    sources: ['flutter.dev', 'reactnative.dev', 'medium.com'],
    relatedArticles: mockRelatedArticles.slice(0, 1),
  },
}

export const NoRelatedArticles: Story = {
  args: {
    title: 'Emerging trends in serverless computing',
    category: 'research',
    date: '2026-02-24T16:00:00Z',
    summary: 'Serverless computing continues to evolve with improvements in cold start times, edge computing integration, and support for stateful workloads.',
    elapsedTime: 120,
    iterations: mockIterations.slice(0, 2),
    sources: ['aws.amazon.com', 'cloud.google.com', 'azure.microsoft.com'],
    relatedArticles: [],
  },
}

export const ManyIterations: Story = {
  args: {
    title: 'Comprehensive analysis of machine learning deployment strategies',
    category: 'deep-research',
    date: '2026-02-23T08:00:00Z',
    summary: sampleSummary,
    elapsedTime: 480,
    iterations: [
      ...mockIterations,
      {
        iterationNumber: 5,
        coverageScore: 5,
        feedback: 'Extended coverage with production deployment patterns.',
        isComplete: true,
      },
    ],
    sources: [...mockSources, 'tensorflow.org', 'pytorch.org', 'mlops.community'],
    relatedArticles: mockRelatedArticles,
  },
}
