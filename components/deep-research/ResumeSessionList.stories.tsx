import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ResumeSessionList, type ResumeSession } from './ResumeSessionList'

const meta: Meta<typeof ResumeSessionList> = {
  title: 'Deep Research/ResumeSessionList',
  component: ResumeSessionList,
  parameters: {
    docs: {
      description: {
        component:
          'Session list card shown when user types `/resume` to select incomplete deep research sessions. Displays topic, iteration progress, coverage score, and relative time.',
      },
    },
  },
  argTypes: {
    sessions: {
      control: 'object',
      description: 'Array of incomplete sessions to display',
    },
    onSelect: {
      action: 'selected',
      description: 'Callback when a session is selected',
    },
    title: {
      control: 'text',
      description: 'Optional title for the list',
    },
    emptyMessage: {
      control: 'text',
      description: 'Optional empty state message',
    },
    emptyDescription: {
      control: 'text',
      description: 'Optional empty state description',
    },
  },
  args: {
    onSelect: (sessionId: string) => console.log('Selected session:', sessionId),
  },
}

export default meta
type Story = StoryObj<typeof ResumeSessionList>

// Mock session data with various states
const mockSessions: ResumeSession[] = [
  {
    id: '1',
    topic: 'Transformer architecture and attention mechanisms in modern LLMs',
    currentIteration: 2,
    targetIterations: 5,
    coverageScore: 3,
    dateStarted: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  },
  {
    id: '2',
    topic: 'Distributed systems consistency patterns and CAP theorem applications',
    currentIteration: 4,
    targetIterations: 5,
    coverageScore: 4,
    dateStarted: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
  },
  {
    id: '3',
    topic: 'React Native performance optimization techniques',
    currentIteration: 1,
    targetIterations: 5,
    coverageScore: 2,
    dateStarted: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
  },
]

export const Default: Story = {
  args: {
    sessions: [mockSessions[0]],
  },
}

export const MultipleSessions: Story = {
  args: {
    sessions: mockSessions,
  },
}

export const EmptyState: Story = {
  args: {
    sessions: [],
    emptyMessage: 'No incomplete sessions',
    emptyDescription:
      "You don't have any research sessions to resume. Start a new deep research session to begin.",
  },
}

export const SingleSessionLowScore: Story = {
  args: {
    sessions: [
      {
        id: '1',
        topic: 'Beginning research on machine learning fundamentals',
        currentIteration: 1,
        targetIterations: 5,
        coverageScore: 1,
        dateStarted: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
      },
    ],
  },
}

export const SingleSessionHighScore: Story = {
  args: {
    sessions: [
      {
        id: '2',
        topic: 'Advanced neural network architectures and training techniques',
        currentIteration: 4,
        targetIterations: 5,
        coverageScore: 5,
        dateStarted: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
      },
    ],
  },
}

export const AllCoverageScores: Story = {
  render: () => (
    <View style={{ gap: 48 }}>
      <ResumeSessionList
        sessions={[
          {
            id: 'score-1',
            topic: 'Research session with coverage score 1',
            currentIteration: 1,
            targetIterations: 5,
            coverageScore: 1,
            dateStarted: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
      />
      <ResumeSessionList
        sessions={[
          {
            id: 'score-2',
            topic: 'Research session with coverage score 2',
            currentIteration: 2,
            targetIterations: 5,
            coverageScore: 2,
            dateStarted: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
      />
      <ResumeSessionList
        sessions={[
          {
            id: 'score-3',
            topic: 'Research session with coverage score 3',
            currentIteration: 3,
            targetIterations: 5,
            coverageScore: 3,
            dateStarted: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
      />
      <ResumeSessionList
        sessions={[
          {
            id: 'score-4',
            topic: 'Research session with coverage score 4',
            currentIteration: 4,
            targetIterations: 5,
            coverageScore: 4,
            dateStarted: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
      />
      <ResumeSessionList
        sessions={[
          {
            id: 'score-5',
            topic: 'Research session with coverage score 5',
            currentIteration: 5,
            targetIterations: 5,
            coverageScore: 5,
            dateStarted: new Date().toISOString(),
          },
        ]}
        onSelect={() => {}}
      />
    </View>
  ),
}

export const RecentSession: Story = {
  args: {
    sessions: [
      {
        id: 'recent',
        topic: 'Just started research on quantum computing fundamentals',
        currentIteration: 1,
        targetIterations: 5,
        coverageScore: 2,
        dateStarted: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 min ago
      },
    ],
  },
}

export const OldSession: Story = {
  args: {
    sessions: [
      {
        id: 'old',
        topic: 'Research on blockchain consensus algorithms from last week',
        currentIteration: 3,
        targetIterations: 5,
        coverageScore: 4,
        dateStarted: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days ago
      },
    ],
  },
}

export const LongTopicTitle: Story = {
  args: {
    sessions: [
      {
        id: 'long',
        topic: 'A very comprehensive research topic about the intersection of machine learning, quantum computing, and distributed systems with a focus on practical applications in modern software architecture',
        currentIteration: 2,
        targetIterations: 5,
        coverageScore: 3,
        dateStarted: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
      },
    ],
  },
}

export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 24 }}>
      <View>
        <ResumeSessionList
          sessions={mockSessions}
          onSelect={() => console.log('Session selected')}
        />
      </View>
      <View>
        <ResumeSessionList
          sessions={[]}
          emptyMessage="Custom empty message"
          emptyDescription="Custom empty description goes here"
          onSelect={() => {}}
        />
      </View>
    </View>
  ),
}
