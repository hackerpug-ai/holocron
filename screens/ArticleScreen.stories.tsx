import type { Meta, StoryObj } from '@storybook/react'
import { ArticleScreen } from './ArticleScreen'

const meta = {
  title: 'Screens/ArticleScreen',
  component: ArticleScreen,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof ArticleScreen>

export default meta
type Story = StoryObj<typeof meta>

const sampleContent = `Large Language Models (LLMs) represent a significant advancement in artificial intelligence, built upon the transformer architecture introduced in the seminal "Attention Is All You Need" paper.

At their core, LLMs use self-attention mechanisms to understand relationships between words in a sequence. This allows them to capture long-range dependencies that previous architectures like RNNs struggled with.

The training process involves two main phases:

1. Pre-training: The model learns from vast amounts of text data, developing an understanding of language patterns, grammar, and general world knowledge.

2. Fine-tuning: The pre-trained model is adapted for specific tasks or aligned with human preferences through techniques like RLHF (Reinforcement Learning from Human Feedback).

Modern LLMs contain billions of parameters, with models like GPT-4 estimated to have over a trillion. This scale enables emergent capabilities - abilities that appear suddenly as models grow larger.

Key challenges in LLM development include:
- Reducing hallucinations and improving factual accuracy
- Managing computational costs and environmental impact
- Ensuring safety and alignment with human values
- Addressing bias in training data and outputs

The field continues to evolve rapidly, with new techniques like mixture-of-experts, constitutional AI, and retrieval-augmented generation pushing the boundaries of what's possible.`

export const Default: Story = {
  args: {
    title: 'Understanding Large Language Models',
    category: 'deep-research',
    date: '2026-02-28T10:30:00Z',
    content: sampleContent,
    iterationCount: 3,
    metadata: {
      source: 'arXiv',
      sourceUrl: 'https://arxiv.org/abs/example',
      wordCount: 1250,
      readingTime: 5,
      lastUpdated: '2026-02-28T14:00:00Z',
    },
    tags: ['AI', 'Machine Learning', 'NLP', 'Transformers', 'Deep Learning'],
  },
}

export const MinimalMetadata: Story = {
  args: {
    title: 'Quick Reference: GraphQL Best Practices',
    category: 'factual',
    date: '2026-02-27T09:00:00Z',
    content: 'GraphQL provides a more efficient, powerful and flexible alternative to REST. Here are the key best practices for implementing GraphQL APIs...',
    tags: ['GraphQL', 'API', 'Backend'],
  },
}

export const DeepResearch: Story = {
  args: {
    title: 'Quantum Computing: Current State and Future Prospects',
    category: 'deep-research',
    date: '2026-02-26T15:45:00Z',
    content: sampleContent,
    iterationCount: 5,
    metadata: {
      source: 'Multiple Academic Sources',
      wordCount: 3500,
      readingTime: 14,
      lastUpdated: '2026-02-27T10:00:00Z',
    },
    tags: ['Quantum Computing', 'Physics', 'Technology', 'Future Tech', 'Computing'],
  },
}

export const WithSource: Story = {
  args: {
    title: 'React Native Performance Guide',
    category: 'url',
    date: '2026-02-25T11:00:00Z',
    content: 'Performance optimization in React Native requires understanding both the JavaScript and native sides of the framework...',
    metadata: {
      source: 'reactnative.dev',
      sourceUrl: 'https://reactnative.dev/docs/performance',
      readingTime: 8,
    },
    tags: ['React Native', 'Performance', 'Mobile'],
  },
}

export const NoTags: Story = {
  args: {
    title: 'Entity: OpenAI',
    category: 'entity',
    date: '2026-02-24T08:30:00Z',
    content: 'OpenAI is an AI research and deployment company. Founded in 2015, it has developed several influential AI models including GPT-4, DALL-E, and Codex...',
    metadata: {
      wordCount: 450,
      readingTime: 2,
    },
  },
}

export const Academic: Story = {
  args: {
    title: 'Attention Is All You Need: A Deep Dive',
    category: 'academic',
    date: '2026-02-23T14:20:00Z',
    content: sampleContent,
    iterationCount: 2,
    metadata: {
      source: 'arXiv:1706.03762',
      sourceUrl: 'https://arxiv.org/abs/1706.03762',
      wordCount: 2800,
      readingTime: 11,
    },
    tags: ['Transformers', 'Attention Mechanism', 'Neural Networks', 'NLP'],
  },
}
