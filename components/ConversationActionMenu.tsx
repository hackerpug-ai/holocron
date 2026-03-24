import { Icon } from '@/components/ui/icon';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { Pencil, Trash2 } from '@/components/ui/icons';
import * as React from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

type ViewState = 'menu' | 'rename' | 'delete';

/**
 * Props for ConversationActionMenu component
 */
export interface ConversationActionMenuProps {
  /** Whether the menu is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (_open: boolean) => void;
  /** Current conversation title (pre-fills rename input) */
  conversationTitle: string;
  /** Callback when user confirms rename */
  onRename?: (_newTitle: string) => void;
  /** Callback when user confirms delete */
  onDelete?: () => void;
  /** Whether a rename operation is in progress */
  isRenaming?: boolean;
  /** Whether a delete operation is in progress */
  isDeleting?: boolean;
}

/**
 * ConversationActionMenu - A menu that provides rename and delete actions for a conversation.
 *
 * Triggered by long-press, shows a menu with "Rename" and "Delete" options.
 * Selecting rename opens a dialog with a text input. Selecting delete opens
 * a destructive confirmation alert dialog.
 *
 * @example
 * ```tsx
 * <ConversationActionMenu
 *   open={isMenuOpen}
 *   onOpenChange={setIsMenuOpen}
 *   conversationTitle="My Conversation"
 *   onRename={(newTitle) => console.log('Renamed to:', newTitle)}
 *   onDelete={() => console.log('Deleted')}
 * />
 * ```
 */
export function ConversationActionMenu({
  open,
  onOpenChange,
  conversationTitle,
  onRename,
  onDelete,
  isRenaming = false,
  isDeleting = false,
}: ConversationActionMenuProps) {
  // Internal state for which view is currently shown
  const [view, setView] = React.useState<ViewState>('menu');

  // State for the rename input value
  const [renameValue, setRenameValue] = React.useState(conversationTitle);

  // Reset view state when menu opens/closes
  React.useEffect(() => {
    if (open) {
      setView('menu');
      setRenameValue(conversationTitle);
    }
  }, [open, conversationTitle]);

  // Handle rename action selection
  const handleRenameSelect = () => {
    setView('rename');
  };

  // Handle delete action selection
  const handleDeleteSelect = () => {
    setView('delete');
  };

  // Handle cancel from any dialog
  const handleCancel = () => {
    onOpenChange(false);
  };

  // Handle save rename
  const handleSaveRename = () => {
    const trimmedTitle = renameValue.trim();
    if (trimmedTitle.length > 0) {
      onRename?.(trimmedTitle);
      onOpenChange(false);
    }
  };

  // Handle confirm delete
  const handleConfirmDelete = () => {
    onDelete?.();
    onOpenChange(false);
  };

  // Check if save button should be disabled
  const isSaveDisabled = renameValue.trim().length === 0 || isRenaming;

  return (
    <>
      {/* Action Menu - shown via DropdownMenu-like popover */}
      {open && view === 'menu' && (
        <MenuOverlay
          onRename={handleRenameSelect}
          onDelete={handleDeleteSelect}
        />
      )}

      {/* Rename Dialog */}
      <Dialog open={open && view === 'rename'} onOpenChange={onOpenChange}>
        <DialogContent testID="rename-dialog">
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
          >
            <DialogHeader>
              <DialogTitle>Rename conversation</DialogTitle>
            </DialogHeader>

            <View className="gap-4 py-4">
              <Input
                testID="rename-input"
                value={renameValue}
                onChangeText={setRenameValue}
                placeholder="Conversation title"
                autoFocus
                onSubmitEditing={isSaveDisabled ? undefined : handleSaveRename}
                accessibilityLabel="Conversation title"
                accessibilityHint="Enter a new name for this conversation"
              />
              {isSaveDisabled && (
                <Text className="text-destructive text-sm">Title cannot be empty</Text>
              )}
            </View>

            <DialogFooter>
              <DialogClose asChild>
                <Button
                  testID="rename-cancel-button"
                  variant="outline"
                  onPress={handleCancel}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text>Cancel</Text>
                </Button>
              </DialogClose>
              <Button
                testID="rename-save-button"
                onPress={handleSaveRename}
                disabled={isSaveDisabled}
                accessibilityRole="button"
                accessibilityLabel={isRenaming ? 'Saving conversation name' : 'Save conversation name'}
                accessibilityState={{ disabled: isSaveDisabled }}
              >
                <Text>{isRenaming ? 'Saving...' : 'Save'}</Text>
              </Button>
            </DialogFooter>
          </KeyboardAvoidingView>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={open && view === 'delete'} onOpenChange={onOpenChange}>
        <AlertDialogContent testID="delete-alert-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription testID="delete-description">
              This will permanently delete this conversation and all its messages.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              testID="delete-cancel-button"
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel delete"
            >
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="delete-confirm-button"
              onPress={handleConfirmDelete}
              className="bg-destructive"
              disabled={isDeleting}
              accessibilityRole="button"
              accessibilityLabel={isDeleting ? 'Deleting conversation' : 'Confirm delete conversation'}
              accessibilityState={{ disabled: isDeleting }}
            >
              <Text className="text-white">{isDeleting ? 'Deleting...' : 'Delete'}</Text>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * MenuOverlay - A simple overlay menu with action buttons
 */
function MenuOverlay({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <View
      testID="action-menu-overlay"
      className="bg-background border-border absolute right-0 top-0 z-50 w-56 overflow-hidden rounded-md border shadow-lg"
      accessibilityRole="menu"
      accessibilityLabel="Conversation actions"
    >
      <View className="p-1">
        {/* Rename Option */}
        <Button
          testID="action-menu-rename-button"
          onPress={onRename}
          variant="ghost"
          className="justify-start gap-3 px-3 py-3"
          accessibilityRole="menuitem"
          accessibilityLabel="Rename conversation"
        >
          <Icon as={Pencil} className="text-foreground size-4" />
          <Text className="text-foreground text-sm">Rename</Text>
        </Button>

        {/* Delete Option */}
        <Button
          testID="action-menu-delete-button"
          onPress={onDelete}
          variant="ghost"
          className="justify-start gap-3 px-3 py-3"
          accessibilityRole="menuitem"
          accessibilityLabel="Delete conversation"
        >
          <Icon as={Trash2} className="text-destructive size-4" />
          <Text className="text-destructive text-sm">Delete</Text>
        </Button>
      </View>
    </View>
  );
}
