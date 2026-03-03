import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { Text } from '@/components/ui/text'
import { DeepResearchDetailView, type DeepResearchSession, type ResearchIteration, type Citation } from './DeepResearchDetailView'

const meta: Meta<typeof DeepResearchDetailView> = {
  title: 'Components/DeepResearchDetailView',
  component: DeepResearchDetailView,
  parameters: {
    docs: {
      description: {
        component:
          'Displays the full results of a completed deep research session with synthesized report, iteration timeline with score progression, expandable iteration cards, and citations list.',
      },
    },
  },
  argTypes: {
    session: {
      control: 'object',
      description: 'The research session to display',
    },
    onBack: {
      action: 'back',
      description: 'Callback when back button is pressed',
    },
  },
}

export default meta
type Story = StoryObj<typeof DeepResearchDetailView>

// Mock data helpers
const createMockCitation = (id: number, title: string, url?: string): Citation => ({
  id,
  title,
  url,
})

const createMockIteration = (
  iterationNumber: number,
  coverageScore: number,
  overrides?: Partial<ResearchIteration>
): ResearchIteration => ({
  iterationNumber,
  coverageScore,
  isComplete: true,
  ...overrides,
})

// Basic session with minimal data
const basicSession: DeepResearchSession = {
  id: 'session-1',
  query: 'What are the latest developments in transformer models?',
  report: `# Transformer Model Developments

## Overview
Transformer models have seen significant advancements in 2024, with improvements in efficiency, scale, and capabilities.

## Key Findings

### Architecture Improvements
- Mixture of Experts (MoE) architectures enable larger models without proportional compute increases
- Flash Attention 2 reduces memory usage and speeds up training
- Ring Attention enables training of extremely long context windows

### Training Techniques
- Curriculum learning is now standard practice for large language models
- Multi-modal training data improves reasoning capabilities
- RLHF alternatives like DPO and RLAIF show promising results`,
  iterations: [
    createMockIteration(1, 2, {
      feedback: 'Initial exploration. Missing core concepts.',
      refinedQueries: ['attention mechanism basics', 'transformer architecture overview'],
    }),
    createMockIteration(2, 3, {
      feedback: 'Better coverage. Need more on recent developments.',
      refinedQueries: ['transformer models 2024', 'latest research papers'],
    }),
  ],
  citations: [
    createMockCitation(1, 'Attention Is All You Need', 'https://arxiv.org/abs/1706.03762'),
    createMockCitation(2, 'Flash Attention 2', 'https://arxiv.org/abs/2307.08691'),
  ],
  completedAt: new Date('2024-01-15T10:30:00Z'),
  savedToHolocron: true,
}

// Full session with complete data
const fullSession: DeepResearchSession = {
  id: 'session-2',
  query: 'How do distributed systems handle network partitions?',
  report: `# Distributed Systems and Network Partitions

## CAP Theorem Fundamentals

The CAP theorem states that a distributed system can provide at most two of three guarantees:
- **Consistency**: Every read receives the most recent write or an error
- **Availability**: Every request receives a response (success or failure)
- **Partition Tolerance**: The system continues to operate despite network partitions

## Handling Strategies

### Eventual Consistency
Most distributed systems choose AP (Availability + Partition Tolerance) with eventual consistency. This means:
- Writes are accepted even during partitions
- Reads may return stale data
- System converges to consistent state after partition heals

### Consistency Patterns
- **Read Repair**: Background process to fix inconsistencies
- **Quorum Reads/Writes**: Require majority agreement
- **Version Vectors**: Track causality between updates

## Real-World Implementations

### Dynamo-style Systems
Amazon Dynamo and its derivatives (Cassandra, Riak) use:
- Vector clocks for conflict detection
- Hinted handoff for availability
- Merkle trees for anti-entropy

### Spanner-style Systems
Google Spanner achieves CP with:
- TrueTime API for global timestamps
- Synchronous replication
- Paxos for consensus`,
  iterations: [
    createMockIteration(1, 2, {
      feedback: 'Initial research identified key topics but lacks depth.',
      refinedQueries: [
        'CAP theorem detailed explanation',
        'network partition examples',
      ],
      findings: [
        'Identified CAP theorem as foundational concept',
        'Found basic definitions of consistency and availability',
      ],
    }),
    createMockIteration(2, 3, {
      feedback: 'Good coverage of theoretical aspects. Missing real-world implementations.',
      refinedQueries: [
        'Dynamo distributed system architecture',
        'Cassandra partition handling',
      ],
      findings: [
        'Explored eventual consistency patterns',
        'Found information on quorum-based approaches',
      ],
    }),
    createMockIteration(3, 4, {
      feedback: 'Strong coverage of implementations. Missing some edge case scenarios.',
      refinedQueries: [
        'network partition recovery patterns',
        'split-brain prevention techniques',
      ],
      findings: [
        'Documented Dynamo-style implementations',
        'Found Spanner architecture details',
      ],
    }),
    createMockIteration(4, 5, {
      feedback: 'Comprehensive coverage achieved. All research objectives met.',
      findings: [
        'Complete coverage of partition handling strategies',
        'Real-world case studies from major systems',
      ],
    }),
  ],
  citations: [
    createMockCitation(1, 'Brewer\'s Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services', 'https://www.ibm.com/blogs/research/'),
    createMockCitation(2, 'Dynamo: Amazon\'s Highly Available Key-value Store', 'https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf'),
    createMockCitation(3, 'Spanner: TrueTime in Database Systems', 'https://research.google/pubs/pub41679/'),
    createMockCitation(4, 'Eventual Consistency - Wikipedia', 'https://en.wikipedia.org/wiki/Eventual_consistency'),
    createMockCitation(5, 'CAP Theorem - A Deep Dive', 'https://www.mongodb.com/basics/cap-theorem'),
  ],
  completedAt: new Date('2024-01-20T14:45:00Z'),
  savedToHolocron: true,
}

// Session with active iteration
const activeSession: DeepResearchSession = {
  ...basicSession,
  iterations: [
    ...basicSession.iterations,
    createMockIteration(3, 3, {
      isActive: true,
      isComplete: false,
    }),
  ],
}

export const Default: Story = {
  args: {
    session: basicSession,
  },
}

export const FullReport: Story = {
  args: {
    session: fullSession,
  },
}

export const WithActiveIteration: Story = {
  args: {
    session: activeSession,
  },
}

export const WithoutCitations: Story = {
  args: {
    session: {
      ...basicSession,
      citations: [],
    },
  },
}

export const NotSavedToHolocron: Story = {
  args: {
    session: {
      ...basicSession,
      savedToHolocron: false,
    },
  },
}

export const LongReport: Story = {
  args: {
    session: {
      ...fullSession,
      report: `# Deep Learning: A Comprehensive Survey

## Introduction

Deep learning has revolutionized artificial intelligence in the past decade. This comprehensive survey covers the foundations, architectures, and applications of deep neural networks.

## Neural Network Fundamentals

### Perceptrons and Layers
The basic unit of neural networks is the perceptron, which takes multiple inputs and produces a single output through:
1. Weighted sum of inputs
2. Addition of bias term
3. Activation function application

### Activation Functions
Common activation functions include:
- **ReLU**: max(0, x) - Most widely used
- **Sigmoid**: 1/(1+e^-x) - Output layer for binary classification
- **Tanh**: (e^x - e^-x)/(e^x + e^-x) - Zero-centered
- **GELU**: Smoother variant of ReLU, used in GPT-3

## Architectures

### Convolutional Neural Networks (CNNs)
CNNs excel at image processing through:
- **Convolutional layers**: Local feature extraction
- **Pooling layers**: Spatial dimensionality reduction
- **Fully connected layers**: Final classification

Key architectures: LeNet, AlexNet, VGG, ResNet, EfficientNet

### Recurrent Neural Networks (RNNs)
RNNs process sequential data through hidden state propagation:
- **Vanilla RNN**: Basic recurrence, suffers from vanishing gradients
- **LSTM**: Gates for long-term memory
- **GRU**: Simplified LSTM with fewer gates

### Transformer Architecture
The transformer revolutionized NLP through:
- **Self-attention**: Global dependencies without recurrence
- **Multi-head attention**: Parallel attention mechanisms
- **Positional encoding**: Sequence order information

Key models: BERT, GPT series, T5, PaLM

## Training Techniques

### Optimization
- **Gradient Descent**: Basic optimization algorithm
- **Adam**: Adaptive learning rates (most popular)
- **SGD with Momentum**: Accelerates convergence

### Regularization
- **Dropout**: Random neuron deactivation
- **Batch Normalization**: Normalizing layer inputs
- **L1/L2 Regularization**: Penalizing large weights
- **Data Augmentation**: Expanding training data

### Learning Rate Scheduling
- **Step decay**: Reduce at fixed intervals
- **Cosine annealing**: Smooth decay schedule
- **Warmup**: Gradual increase at training start

## Transfer Learning

### Pre-training and Fine-tuning
1. **Pre-training**: Learn on large, general dataset
2. **Fine-tuning**: Adapt to specific task

### Popular Pre-trained Models
- **Vision**: ResNet, ViT, CLIP
- **Language**: GPT, BERT, T5
- **Multi-modal**: DALL-E, Stable Diffusion

## Applications

### Computer Vision
- Image classification
- Object detection
- Semantic segmentation
- Image generation

### Natural Language Processing
- Machine translation
- Sentiment analysis
- Question answering
- Text generation

### Reinforcement Learning
- Game playing (AlphaGo)
- Robotics control
- Autonomous driving

## Challenges and Future Directions

### Current Challenges
- **Energy efficiency**: Training large models consumes significant power
- **Interpretability**: Understanding model decisions
- **Bias and fairness**: Addressing learned prejudices
- **Data efficiency**: Reducing data requirements

### Emerging Trends
- **Sparse architectures**: Mixture of Experts
- **Efficient attention**: Linear attention mechanisms
- **Neuromorphic computing**: Brain-inspired hardware
- **Self-supervised learning**: Learning without labels

## Conclusion

Deep learning continues to advance rapidly, with new architectures and techniques emerging regularly. The field balances between:
- Scaling to larger models
- Improving efficiency
- Enhancing interpretability
- Ensuring ethical use

As we move forward, the integration of deep learning into real-world applications will require careful consideration of technical, ethical, and societal implications.`,
    },
  },
}

export const AllVariants: Story = {
  render: () => (
    <View className="p-4 gap-4">
      <Text className="text-center text-foreground font-bold mb-4" variant="h3">
        DeepResearchDetailView Variants
      </Text>

      <View className="gap-2">
        <Text className="text-muted-foreground text-sm">1. Basic Session</Text>
        <DeepResearchDetailView session={basicSession} />
      </View>
    </View>
  ),
}

// Test for iteration expansion
export const IterationExpansion: Story = {
  args: {
    session: fullSession,
  },
}

// Test for score progression visualization
export const ScoreProgression: Story = {
  args: {
    session: fullSession,
  },
}

// Test for many citations
export const ManyCitations: Story = {
  args: {
    session: {
      ...fullSession,
      citations: [
        createMockCitation(1, 'Research Paper 1', 'https://arxiv.org/abs/001'),
        createMockCitation(2, 'Research Paper 2', 'https://arxiv.org/abs/002'),
        createMockCitation(3, 'Research Paper 3', 'https://arxiv.org/abs/003'),
        createMockCitation(4, 'Research Paper 4', 'https://arxiv.org/abs/004'),
        createMockCitation(5, 'Research Paper 5', 'https://arxiv.org/abs/005'),
        createMockCitation(6, 'Research Paper 6', 'https://arxiv.org/abs/006'),
        createMockCitation(7, 'Research Paper 7', 'https://arxiv.org/abs/007'),
        createMockCitation(8, 'Research Paper 8', 'https://arxiv.org/abs/008'),
        createMockCitation(9, 'Research Paper 9', 'https://arxiv.org/abs/009'),
        createMockCitation(10, 'Research Paper 10', 'https://arxiv.org/abs/010'),
      ],
    },
  },
}
