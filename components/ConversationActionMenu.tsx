import * as React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import { Icon } from '@/components/ui/icon';
import { Pencil, Trash2 } from '@/components/ui/icons';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';

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

  // Reset to menu only when the shell transitions closed → open (not on title churn).
  const wasOpenRef = React.useRef(false);
  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      setView('menu');
      setRenameValue(conversationTitle);
    }
    if (!open) {
      setView('menu');
    }
    wasOpenRef.current = open;
  }, [open, conversationTitle]);

  // Keep rename field in sync when title changes while still on the menu.
  React.useEffect(() => {
    if (open && view === 'menu') {
      setRenameValue(conversationTitle);
    }
  }, [conversationTitle, open, view]);

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

  // Keep parent `open` true while rename/delete sub-views are active; only
  // propagate close. Prevents Dialog/Alert onOpenChange(false) races from
  // collapsing the shell when switching menu → rename.
  const handleSubViewOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onOpenChange(false);
    }
  };

  return (
    <>
      {/* Action Menu - shown via DropdownMenu-like popover */}
      {open && view === 'menu' && (
        <MenuOverlay onRename={handleRenameSelect} onDelete={handleDeleteSelect} />
      )}

      {/*
        Rename UI uses RN Modal + plain View testIDs so Maestro can see
        rename-dialog / rename-input / rename-save-button. rn-primitives Dialog
        Content lives under FullWindowOverlay/portal and often fails to expose
        testID to the XCUITest hierarchy.
      */}
      <Modal
        visible={open && view === 'rename'}
        transparent
        animationType="fade"
        onRequestClose={handleCancel}
        statusBarTranslucent
      >
        <View
          testID="rename-dialog"
          accessibilityLabel="Rename conversation"
          accessibilityViewIsModal
          className="flex-1 items-center justify-center bg-black/50 p-4"
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            className="w-full max-w-lg"
          >
            <View className="bg-background border-border w-full gap-4 rounded-lg border p-6 shadow-lg shadow-black/5">
              <View accessibilityRole="header" accessibilityLabel="Rename conversation">
                <Text className="text-foreground text-lg font-semibold leading-none">
                  Rename conversation
                </Text>
              </View>

              <View className="gap-4 py-2">
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

              <View className="flex-row justify-end gap-2">
                <Button
                  testID="rename-cancel-button"
                  variant="outline"
                  onPress={handleCancel}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel rename"
                >
                  <Text>Cancel</Text>
                </Button>
                <Button
                  testID="rename-save-button"
                  onPress={handleSaveRename}
                  disabled={isSaveDisabled}
                  accessibilityRole="button"
                  accessibilityLabel={
                    isRenaming ? 'Saving conversation name' : 'Save conversation name'
                  }
                  accessibilityState={{ disabled: isSaveDisabled }}
                >
                  <Text>{isRenaming ? 'Saving...' : 'Save'}</Text>
                </Button>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={open && view === 'delete'} onOpenChange={handleSubViewOpenChange}>
        <AlertDialogContent testID="delete-alert-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription testID="delete-description">
              This will permanently delete this conversation and all its messages. This action
              cannot be undone.
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
              accessibilityLabel={
                isDeleting ? 'Deleting conversation' : 'Confirm delete conversation'
              }
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
 * MenuOverlay - Action menu positioned below the status bar / safe area.
 *
 * Prior bug (AC-4): absolute top-0 placed rename-button under the iOS status bar
 * (hierarchy bounds y≈4–39). Maestro coordinate taps land in the dead zone and
 * never fire onPress, so rename-dialog never opens.
 */
function MenuOverlay({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const insets = useSafeAreaInsets();
  // Keep menu clear of status bar; Maestro taps the vertical center of the control.
  const topOffset = Math.max(insets.top, 20) + 8;

  return (
    <View
      testID="action-menu-overlay"
      pointerEvents="box-none"
      className="absolute bottom-0 left-0 right-0 top-0 z-50"
      accessibilityRole="menu"
      accessibilityLabel="Conversation actions"
    >
      <View pointerEvents="box-none" className="absolute right-2" style={{ top: topOffset }}>
        <View className="bg-background border-border w-56 overflow-hidden rounded-md border shadow-lg">
          <View className="p-1">
            {/* Rename Option — plain Pressable for reliable Maestro hit-testing */}
            <Pressable
              testID="action-menu-rename-button"
              onPress={onRename}
              accessibilityRole="menuitem"
              accessibilityLabel="Rename conversation"
              accessible
              className="flex-row items-center justify-start gap-3 rounded-md px-3 py-3 active:bg-accent"
              hitSlop={8}
            >
              <Icon as={Pencil} className="text-foreground size-4" />
              <Text className="text-foreground text-sm" accessible={false}>
                Rename
              </Text>
            </Pressable>

            {/* Delete Option */}
            <Pressable
              testID="action-menu-delete-button"
              onPress={onDelete}
              accessibilityRole="menuitem"
              accessibilityLabel="Delete conversation"
              accessible
              className="flex-row items-center justify-start gap-3 rounded-md px-3 py-3 active:bg-accent"
              hitSlop={8}
            >
              <Icon as={Trash2} className="text-destructive size-4" />
              <Text className="text-destructive text-sm" accessible={false}>
                Delete
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
