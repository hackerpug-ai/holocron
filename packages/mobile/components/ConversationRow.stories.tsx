import type { Meta, StoryObj } from '@storybook/react'
import { View } from 'react-native'
import { ConversationRow } from './ConversationRow'

const meta: Meta<typeof ConversationRow> = {
  title: 'Components/ConversationRow',
  component: ConversationRow,
  parameters: {
    docs: {
      description: {
        component:
          'A conversation row component for the drawer list. Displays title, last message preview, and timestamp. Long-press reveals an inline delete button with haptic feedback.',
      },
    },
  },
  decorators: [
    (Story) => (
      <View style={{ padding: 16, gap: 8 }}>
        <Story />
      </View>
    ),
  ],
  argTypes: {
    title: {
      control: { type: 'text' },
      description: 'Conversation title',
    },
    lastMessage: {
      control: { type: 'text' },
      description: 'Preview of the last message',
    },
    lastMessageAt: {
      control: { type: 'date' },
      description: 'When the last message was sent',
    },
    isActive: {
      control: { type: 'boolean' },
      description: 'Whether this is the active conversation',
    },
    isDeleteVisible: {
      control: { type: 'boolean' },
      description: 'Whether the delete button is currently visible',
    },
    onPress: {
      action: 'pressed',
      description: 'Callback when row is pressed',
    },
    onLongPress: {
      action: 'longPressed',
      description: 'Callback when row is long-pressed (reveals delete)',
    },
    onDelete: {
      action: 'delete',
      description: 'Callback when delete button is tapped',
    },
  },
  args: {
    id: '1',
    title: 'Research on Neural Networks',
    lastMessage: 'What are the key differences between attention mechanisms?',
    lastMessageAt: new Date(),
    isActive: false,
    isDeleteVisible: false,
  },
}

export default meta
type Story = StoryObj<typeof ConversationRow>

export const Default: Story = {}

export const Active: Story = {
  args: {
    isActive: true,
  },
}

export const DeleteVisible: Story = {
  args: {
    isDeleteVisible: true,
    onDelete: () => console.log('Delete triggered'),
  },
}

export const NoMessage: Story = {
  args: {
    lastMessage: undefined,
    lastMessageAt: undefined,
  },
}

export const LongTitle: Story = {
  args: {
    title: 'This is a very long conversation title that should be truncated with ellipsis',
    lastMessage: 'And this is also a very long message preview that should be truncated to fit in the available space',
  },
}

export const VariousTimestamps: Story = {
  render: () => {
    const now = new Date()
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60 * 1000)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

    return (
      <View style={{ gap: 8 }}>
        <ConversationRow id="1" title="Just now" lastMessage="Sent just now" lastMessageAt={now} />
        <ConversationRow id="2" title="5 minutes ago" lastMessage="Sent 5 mins ago" lastMessageAt={fiveMinsAgo} />
        <ConversationRow id="3" title="1 hour ago" lastMessage="Sent 1 hour ago" lastMessageAt={oneHourAgo} />
        <ConversationRow id="4" title="Yesterday" lastMessage="Sent yesterday" lastMessageAt={yesterday} />
        <ConversationRow id="5" title="3 days ago" lastMessage="Sent 3 days ago" lastMessageAt={threeDaysAgo} />
        <ConversationRow id="6" title="2 weeks ago" lastMessage="Sent 2 weeks ago" lastMessageAt={twoWeeksAgo} />
      </View>
    )
  },
}

export const ConversationList: Story = {
  render: () => {
    const conversations = [
      { id: '1', title: 'Active Chat', lastMessage: 'This is the current chat', isActive: true },
      { id: '2', title: 'Python Programming', lastMessage: 'How do I handle async/await?' },
      { id: '3', title: 'React Native Help', lastMessage: 'The navigation isnt working properly' },
      { id: '4', title: 'API Design', lastMessage: 'What REST conventions should I follow?' },
      { id: '5', title: 'Database Schema', lastMessage: 'How should I model the relationships?' },
    ]

    return (
      <View style={{ gap: 4 }}>
        {conversations.map((conv) => (
          <ConversationRow
            key={conv.id}
            id={conv.id}
            title={conv.title}
            lastMessage={conv.lastMessage}
            lastMessageAt={new Date()}
            isActive={conv.isActive}
            onPress={() => console.log(`Pressed ${conv.title}`)}
            onDelete={() => console.log(`Delete ${conv.title}`)}
          />
        ))}
      </View>
    )
  },
}

export const LongPressDelete: Story = {
  render: () => {
    const items = [
      { id: '1', title: 'First conversation', message: 'Long-press to reveal delete' },
      { id: '2', title: 'Second conversation', message: 'Only one delete button at a time' },
      { id: '3', title: 'Third conversation', message: 'Tap delete to confirm' },
    ]

    return (
      <View style={{ gap: 4 }}>
        {items.map((item) => (
          <ConversationRow
            key={item.id}
            id={item.id}
            title={item.title}
            lastMessage={item.message}
            lastMessageAt={new Date()}
            onLongPress={() => console.log(`Long-pressed ${item.title}`)}
            onDelete={() => console.log(`Deleting ${item.title}`)}
          />
        ))}
      </View>
    )
  },
  parameters: {
    docs: {
      description: {
        story:
          'Long-press any row to reveal the inline delete button. Only one row shows the button at a time. Button auto-dismisses after 4 seconds.',
      },
    },
  },
}
