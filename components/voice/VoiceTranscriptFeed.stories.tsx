import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { VoiceTranscriptFeed } from './VoiceTranscriptFeed'
import type { TranscriptEntry } from './VoiceTranscriptFeed'

// ─── Mock Factory ──────────────────────────────────────────────────────────────

function makeEntry(
  id: string,
  speaker: 'user' | 'agent',
  text: string,
  isPartial = false
): TranscriptEntry {
  return {
    id,
    speaker,
    text,
    timestamp: new Date().toISOString(),
    isPartial,
  }
}

// ─── Meta ──────────────────────────────────────────────────────────────────────

const meta: Meta<typeof VoiceTranscriptFeed> = {
  title: 'Voice/VoiceTranscriptFeed',
  component: VoiceTranscriptFeed,
  parameters: {
    docs: {
      description: {
        component:
          'Scrollable transcript display within the voice overlay. User entries are right-aligned with bg-secondary, agent entries are left-aligned with bg-muted and 3dp left accent bar. Auto-scrolls to bottom on new entries. Partial entries show blinking cursor.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 32, alignItems: 'center', justifyContent: 'center', flex: 1, backgroundColor: '#f5f5f5' }}>
        <View style={{ width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 12, padding: 16, height: 300 }}>
          <Story />
        </View>
      </View>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VoiceTranscriptFeed>

// ─── Stories ───────────────────────────────────────────────────────────────────

/**
 * Empty transcript — shows "No transcript yet" message.
 */
export const Empty: Story = {
  args: {
    transcript: [],
  },
}

/**
 * Single user message — right-aligned, bg-secondary background.
 */
export const SingleUser: Story = {
  args: {
    transcript: [
      makeEntry('1', 'user', 'Hello, how are you?'),
    ],
  },
}

/**
 * Single agent message — left-aligned, bg-muted background with accent bar.
 */
export const SingleAgent: Story = {
  args: {
    transcript: [
      makeEntry('1', 'agent', 'I\'m doing well, thank you!'),
    ],
  },
}

/**
 * Conversation with multiple turns.
 */
export const Conversation: Story = {
  args: {
    transcript: [
      makeEntry('1', 'user', 'What can you help me with?'),
      makeEntry('2', 'agent', 'I can help you search your knowledge base, manage tasks, check on research, and navigate the app.'),
      makeEntry('3', 'user', 'That sounds great!'),
      makeEntry('4', 'agent', 'Is there anything specific you\'d like to do?'),
    ],
  },
}

/**
 * Partial entry — shows blinking cursor at the end.
 */
export const PartialEntry: Story = {
  args: {
    transcript: [
      makeEntry('1', 'user', 'Tell me about'),
      makeEntry('2', 'agent', 'I can tell you about various topics including', true),
    ],
  },
}

/**
 * Long transcript — tests scrolling behavior.
 */
export const LongTranscript: Story = {
  args: {
    transcript: [
      makeEntry('1', 'user', 'Hi there!'),
      makeEntry('2', 'agent', 'Hello! How can I help you today?'),
      makeEntry('3', 'user', 'I need to find some information about project X'),
      makeEntry('4', 'agent', 'I can help with that. Let me search the knowledge base.'),
      makeEntry('5', 'user', 'Great, thanks!'),
      makeEntry('6', 'agent', 'I found several documents related to project X. Would you like me to summarize them?'),
      makeEntry('7', 'user', 'Yes please, give me a brief summary'),
      makeEntry('8', 'agent', 'Project X is a new initiative focused on improving user experience. The main goals include faster load times, better mobile support, and enhanced accessibility.'),
      makeEntry('9', 'user', 'That\'s helpful. When is it scheduled to launch?'),
      makeEntry('10', 'agent', 'The target launch date is Q4 2026, but that may change based on development progress.'),
    ],
  },
}

/**
 * All entry types displayed together.
 */
export const AllEntryTypes: Story = {
  args: {
    transcript: [
      makeEntry('1', 'user', 'User message'),
      makeEntry('2', 'agent', 'Agent response'),
      makeEntry('3', 'user', 'Another user message'),
      makeEntry('4', 'agent', 'Partial response...', true),
    ],
  },
}
