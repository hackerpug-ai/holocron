import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { VoiceToolActivityPill } from './VoiceToolActivityPill'

const meta = {
  title: 'Voice/VoiceToolActivityPill',
  component: VoiceToolActivityPill,
  parameters: {
    docs: {
      description: {
        component:
          'Animated pill that surfaces the active tool being executed during a voice session. Renders null when toolName is null. Shows ActivityIndicator + display name when a tool is active.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof VoiceToolActivityPill>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    toolName: 'search_knowledge',
  },
}

export const Hidden: Story = {
  args: {
    toolName: null,
  },
}

export const AllVariants: Story = {
  render: () => (
    <View style={{ gap: 12, alignItems: 'center' }}>
      <VoiceToolActivityPill toolName="search_knowledge" />
      <VoiceToolActivityPill toolName="list_recent_documents" />
      <VoiceToolActivityPill toolName="get_document" />
      <VoiceToolActivityPill toolName="get_conversations" />
      <VoiceToolActivityPill toolName="get_research_sessions" />
      <VoiceToolActivityPill toolName="get_improvements" />
      <VoiceToolActivityPill toolName="check_agent_status" />
      <VoiceToolActivityPill toolName="start_research" />
      <VoiceToolActivityPill toolName="submit_improvement" />
      <VoiceToolActivityPill toolName="create_note" />
      <VoiceToolActivityPill toolName="navigate_app" />
      <VoiceToolActivityPill toolName="unknown_tool_fallback" />
    </View>
  ),
}
