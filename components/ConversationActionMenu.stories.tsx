import type { Meta, StoryObj } from '@storybook/react';
import { expect } from '@storybook/jest';
import { within, userEvent } from '@storybook/testing-library';
import { View, Pressable, Text as RNText } from 'react-native';
import * as React from 'react';
import { ConversationActionMenu } from './ConversationActionMenu';

const meta: Meta<typeof ConversationActionMenu> = {
  title: 'Components/ConversationActionMenu',
  component: ConversationActionMenu,
  parameters: {
    docs: {
      description: {
        component:
          'Action menu for conversation management. Triggered by long-press on a conversation row. Provides rename and delete actions with confirmation dialogs.',
      },
    },
  },
  argTypes: {
    open: {
      control: { type: 'boolean' },
      description: 'Whether the menu is open',
    },
    conversationTitle: {
      control: { type: 'text' },
      description: 'Current conversation title (pre-fills rename input)',
    },
    onRename: {
      action: 'renamed',
      description: 'Callback when user confirms rename',
    },
    onDelete: {
      action: 'deleted',
      description: 'Callback when user confirms delete',
    },
    onOpenChange: {
      action: 'openChanged',
      description: 'Callback when open state changes',
    },
  },
  args: {
    open: true,
    conversationTitle: 'My Research Conversation',
  },
  decorators: [
    (Story) => (
      <View className="bg-background relative h-96 w-full">
        <View className="absolute right-4 top-4">
          <Story />
        </View>
      </View>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof ConversationActionMenu>;

/**
 * Default story showing the action menu with Rename and Delete options
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Verify the action menu overlay exists with rename and delete buttons
    await expect(canvas.getByTestId('action-menu-overlay')).toBeTruthy()
    await expect(canvas.getByTestId('action-menu-rename-button')).toBeTruthy()
    await expect(canvas.getByTestId('action-menu-delete-button')).toBeTruthy()
    // Verify button labels
    await expect(canvas.getByText('Rename')).toBeTruthy()
    await expect(canvas.getByText('Delete')).toBeTruthy()
  },
};

/**
 * RenameFlow - Story that demonstrates the rename flow
 * To see the rename dialog, open the menu and tap "Rename"
 */
export const RenameFlow: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The rename dialog opens when "Rename" is tapped. Shows a text input pre-filled with the current conversation title. The Save button is disabled when the input is empty.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Click the rename button to open the rename dialog
    const renameButton = canvas.getByTestId('action-menu-rename-button')
    await userEvent.click(renameButton)

    // Verify the rename dialog appears with expected elements
    await expect(canvas.getByTestId('rename-dialog')).toBeTruthy()
    await expect(canvas.getByTestId('rename-input')).toBeTruthy()
    await expect(canvas.getByTestId('rename-cancel-button')).toBeTruthy()
    await expect(canvas.getByTestId('rename-save-button')).toBeTruthy()
  },
};

/**
 * DeleteConfirmation - Shows the destructive alert dialog
 * To see the delete confirmation, open the menu and tap "Delete"
 */
export const DeleteConfirmation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'The delete confirmation alert opens when "Delete" is tapped. Shows a destructive warning that the action cannot be undone.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Click the delete button to open the delete confirmation dialog
    const deleteButton = canvas.getByTestId('action-menu-delete-button')
    await userEvent.click(deleteButton)

    // Verify the delete alert dialog appears with expected elements
    await expect(canvas.getByTestId('delete-alert-dialog')).toBeTruthy()
    await expect(canvas.getByTestId('delete-description')).toBeTruthy()
    await expect(canvas.getByTestId('delete-cancel-button')).toBeTruthy()
    await expect(canvas.getByTestId('delete-confirm-button')).toBeTruthy()
  },
};

/**
 * LongTitleRename - Tests overflow handling with a very long title
 */
export const LongTitleRename: Story = {
  args: {
    conversationTitle:
      'This is an extremely long conversation title that might overflow the text input field and should be handled gracefully by scrolling',
  },
  parameters: {
    docs: {
      description: {
        story:
          'Tests how the rename dialog handles very long conversation titles. The input should scroll and display the full title.',
      },
    },
  },
};

/**
 * Interactive - Full interactive flow from menu to action completion
 */
export const Interactive: Story = {
  render: (args) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [lastAction, setLastAction] = React.useState('None');

    const handleRename = (newTitle: string) => {
      setLastAction(`Renamed to: "${newTitle}"`);
      args.onRename?.(newTitle);
    };

    const handleDelete = () => {
      setLastAction('Deleted');
      args.onDelete?.();
    };

    return (
      <View className="bg-background relative h-96 w-full">
        {/* Trigger button to open menu */}
        <View className="absolute right-4 top-4">
          <Pressable
            testID="open-menu-button"
            onPress={() => setIsOpen(true)}
            className="bg-primary rounded-md px-4 py-2"
          >
            <RNText className="text-white">Open Menu</RNText>
          </Pressable>
        </View>

        {/* Action menu */}
        <ConversationActionMenu
          {...args}
          open={isOpen}
          onOpenChange={setIsOpen}
          onRename={handleRename}
          onDelete={handleDelete}
        />

        {/* Status display */}
        <View className="absolute bottom-4 left-4 right-4 rounded-md border border-border bg-card p-4">
          <RNText className="text-muted-foreground text-sm">Last Action:</RNText>
          <RNText className="text-foreground mt-1 font-medium">{lastAction}</RNText>
        </View>
      </View>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          'Fully interactive story. Click "Open Menu" to see the action menu, then navigate through rename and delete flows. Watch the status indicator update after each action.',
      },
    },
  },
};

/**
 * EmptyTitleValidation - Shows the disabled save state
 */
export const EmptyTitleValidation: Story = {
  args: {
    conversationTitle: '',
  },
  parameters: {
    docs: {
      description: {
        story:
          'When the conversation title is empty or becomes empty, the Save button in the rename dialog should be disabled to prevent saving invalid titles.',
      },
    },
  },
};
