import { Icon } from '@/components/ui/icon';
import type { Text as TextType } from '@/components/ui/text';
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
import { cn } from '@/lib/utils';
import { Pencil, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

type ViewState = 'menu' | 'rename' | 'delete';

/**
 * Props for ConversationActionMenu component
 */
export interface ConversationActionMenuProps {
  /** Whether the menu is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Current conversation title (pre-fills rename input) */
  conversationTitle: string;
  /** Callback when user confirms rename */
  onRename?: (newTitle: string) => void;
  /** Callback when user confirms delete */
  onDelete?: () => void;
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
  const isSaveDisabled = renameValue.trim().length === 0;

  return (
    <>
      {/* Action Menu - shown via DropdownMenu-like popover */}
      {open && view === 'menu' && (
        <MenuOverlay
          onClose={handleCancel}
          onRename={handleRenameSelect}
          onDelete={handleDeleteSelect}
        />
      )}

      {/* Rename Dialog */}
      <Dialog open={open && view === 'rename'} onOpenChange={onOpenChange}>
        <DialogContent testID="rename-dialog">
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
              >
                <Text>Cancel</Text>
              </Button>
            </DialogClose>
            <Button
              testID="rename-save-button"
              onPress={handleSaveRename}
              disabled={isSaveDisabled}
            >
              <Text>Save</Text>
            </Button>
          </DialogFooter>
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
            <AlertDialogCancel testID="delete-cancel-button" onPress={handleCancel}>
              <Text>Cancel</Text>
            </AlertDialogCancel>
            <AlertDialogAction
              testID="delete-confirm-button"
              onPress={handleConfirmDelete}
              className="bg-destructive"
            >
              <Text className="text-white">Delete</Text>
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
  onClose,
  onRename,
  onDelete,
}: {
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  return (
    <View
      testID="action-menu-overlay"
      className="bg-background border-border absolute right-0 top-0 z-50 w-56 overflow-hidden rounded-md border shadow-lg"
    >
      <View className="p-1">
        {/* Rename Option */}
        <Button
          testID="action-menu-rename-button"
          onPress={onRename}
          variant="ghost"
          className="justify-start gap-3 px-3 py-3"
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
        >
          <Icon as={Trash2} className="text-destructive size-4" />
          <Text className="text-destructive text-sm">Delete</Text>
        </Button>
      </View>
    </View>
  );
}
