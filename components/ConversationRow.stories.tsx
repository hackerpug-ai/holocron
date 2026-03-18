import type { Meta, StoryObj } from '@storybook/react'
import { View, Dimensions } from 'react-native'
import { ConversationRow } from './ConversationRow'

const meta: Meta<typeof ConversationRow> = {
  title: 'Components/ConversationRow',
  component: ConversationRow,
  parameters: {
    docs: {
      description: {
        component:
          'A conversation row component for the drawer list. Displays title, last message preview, and timestamp. Supports swipe-to-delete gesture with haptic feedback.',
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
    onPress: {
      action: 'pressed',
      description: 'Callback when row is pressed',
    },
    onLongPress: {
      action: 'longPressed',
      description: 'Callback when row is long-pressed',
    },
    onDelete: {
      action: 'delete',
      description: 'Callback when delete is triggered (swipe past threshold)',
    },
  },
  args: {
    title: 'Research on Neural Networks',
    lastMessage: 'What are the key differences between attention mechanisms?',
    lastMessageAt: new Date(),
    isActive: false,
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

export const WithDelete: Story = {
  args: {
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
        <ConversationRow title="Just now" lastMessage="Sent just now" lastMessageAt={now} />
        <ConversationRow title="5 minutes ago" lastMessage="Sent 5 mins ago" lastMessageAt={fiveMinsAgo} />
        <ConversationRow title="1 hour ago" lastMessage="Sent 1 hour ago" lastMessageAt={oneHourAgo} />
        <ConversationRow title="Yesterday" lastMessage="Sent yesterday" lastMessageAt={yesterday} />
        <ConversationRow title="3 days ago" lastMessage="Sent 3 days ago" lastMessageAt={threeDaysAgo} />
        <ConversationRow title="2 weeks ago" lastMessage="Sent 2 weeks ago" lastMessageAt={twoWeeksAgo} />
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

/**
 * Swipe Interaction Stories
 *
 * These stories demonstrate the swipe-to-delete gesture behavior.
 * Note: In Storybook, the actual gesture interaction requires the
 * component to be running in a React Native environment.
 */

export const SwipeableWithDelete: Story = {
  args: {
    title: 'Swipe me to delete',
    lastMessage: 'Swipe left past 35% to trigger delete',
    onDelete: () => console.log('Delete triggered!'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Swipe left to reveal the delete zone. Continue swiping past 35% of the screen width to trigger the delete action. Release before the threshold to snap back.',
      },
    },
  },
}

export const SwipeableActive: Story = {
  args: {
    title: 'Active with swipe',
    lastMessage: 'This active conversation can be swiped to delete',
    isActive: true,
    onDelete: () => console.log('Delete triggered!'),
  },
}

export const SwipeableDisabled: Story = {
  args: {
    title: 'No swipe available',
    lastMessage: 'This row has no onDelete callback, so no swipe gesture',
    // No onDelete - swipe is disabled
  },
  parameters: {
    docs: {
      description: {
        story:
          'When no onDelete callback is provided, the row does not wrap in SwipeableRow and no swipe gesture is available.',
      },
    },
  },
}

export const SwipeableMultipleRows: Story = {
  render: () => {
    const items = [
      { id: '1', title: 'First conversation', message: 'Swipe any row to delete' },
      { id: '2', title: 'Second conversation', message: 'Each row has its own swipe gesture' },
      { id: '3', title: 'Third conversation', message: 'Delete animation collapses the row' },
      { id: '4', title: 'Fourth conversation', message: 'Notice the haptic feedback' },
    ]

    return (
      <View style={{ gap: 4 }}>
        {items.map((item) => (
          <ConversationRow
            key={item.id}
            title={item.title}
            lastMessage={item.message}
            lastMessageAt={new Date()}
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
          'Multiple swipeable rows. Each row independently supports swipe-to-delete. The delete animation collapses the row height smoothly.',
      },
    },
  },
}

/**
 * Test: Gesture Completion Animation
 *
 * This story is for testing that swiping past the threshold triggers
 * the collapse animation correctly.
 */
export const TestGestureCompletion: Story = {
  args: {
    title: 'Test: Gesture Completion',
    lastMessage: 'Swipe past 35% threshold to see collapse animation',
    onDelete: () => console.log('DELETE ACTION TRIGGERED - Animation should play'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Test checklist:\n1. Swipe left to reveal delete zone\n2. Cross the 35% threshold (haptic feedback)\n3. Release - row should collapse with animation\n4. onDelete callback should be called',
      },
    },
  },
}

/**
 * Test: Snap-Back Behavior
 *
 * This story is for testing that releasing before the threshold
 * snaps the row back to its original position.
 */
export const TestSnapBack: Story = {
  args: {
    title: 'Test: Snap Back',
    lastMessage: 'Swipe but release BEFORE 35% threshold',
    onDelete: () => console.log('This should NOT be called'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Test checklist:\n1. Swipe left partially (less than 35%)\n2. Release - row should spring back\n3. onDelete should NOT be called\n4. Row should be back at original position',
      },
    },
  },
}

/**
 * Test: Delete Confirmation
 *
 * This story verifies that the onDelete callback is only triggered
 * when the user completes the swipe gesture past the threshold.
 */
export const TestDeleteConfirmation: Story = {
  render: () => (
    <View style={{ gap: 16 }}>
      <ConversationRow
        title="Incomplete swipe = no delete"
        lastMessage="Swipe but release before threshold"
        onDelete={() => alert('This should not appear!')}
      />
      <ConversationRow
        title="Complete swipe = delete"
        lastMessage="Swipe past 35% to confirm delete"
        onDelete={() => alert('Delete confirmed!')}
      />
    </View>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Two rows to test delete behavior:\n- First row: swipe and release before threshold = no action\n- Second row: swipe past threshold = delete triggered',
      },
    },
  },
}

/**
 * Test: Dark Mode Colors
 *
 * This story is for verifying that the delete zone colors
 * render correctly in dark mode.
 */
export const TestDarkModeColors: Story = {
  args: {
    title: 'Test: Dark Mode',
    lastMessage: 'Verify delete zone colors in both themes',
    onDelete: () => console.log('Delete'),
  },
  parameters: {
    docs: {
      description: {
        story:
          'Visual checklist:\n1. Delete zone background should be red (destructive color)\n2. Trash icon should be white\n3. "DELETE" text should be white\n4. Opacity should increase with swipe progress',
      },
    },
  },
}
