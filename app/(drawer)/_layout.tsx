import { useDrawerStatus } from '@react-navigation/drawer';
import { useQuery, useZero } from '@rocicorp/zero/react';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversationsByOwner, conversationsBySearchTerm } from '@/app/zero/queries';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { log } from '@/lib/logger-client';
import type { Conversation } from '@/lib/types/conversations';
import { DrawerContent } from '@/screens/DrawerContent';

type ZeroConversationRow = {
  id: string;
  title?: string | null;
  last_message_preview?: string | null;
  updated_at: number;
  created_at: number;
};

function mapConversation(c: ZeroConversationRow): Conversation {
  return {
    id: c.id,
    title: c.title ?? 'Untitled Chat',
    lastMessage: c.last_message_preview ?? undefined,
    lastMessageAt: c.updated_at ? new Date(c.updated_at) : undefined,
    createdAt: new Date(c.created_at),
    updatedAt: new Date(c.updated_at),
  };
}

/**
 * Custom drawer content that wires Zero useQuery + mutators
 * to the DrawerContent component and handles navigation.
 */
function CustomDrawerContent() {
  const router = useRouter();
  const zero = useZero();
  const _isDrawerOpen = useDrawerStatus() === 'open';
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [actionMenuConversation, setActionMenuConversation] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [searchQuery]);

  // Zero query for conversations list (conversationsByOwner)
  const [conversationRows] = useQuery(conversationsByOwner());
  const conversations = (conversationRows ?? []) as unknown as ZeroConversationRow[];

  // Server-side search via Zero when debounced query > 2 chars
  const searchEnabled = debouncedQuery.trim().length > 2;
  const [searchRows] = useQuery(
    searchEnabled ? conversationsBySearchTerm(debouncedQuery.trim()) : undefined
  );
  const searchResults = searchEnabled
    ? ((searchRows ?? []) as unknown as ZeroConversationRow[])
    : undefined;

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const _isCreating = false;
  const isRenaming = false;
  const isDeleting = false;
  const error = null;

  const handleNewChatPress = () => {
    router.push('/chat/new');
  };

  const handleConversationDelete = (conversation: Conversation) => {
    executeDelete(conversation.id);
  };

  /** Long-press opens ConversationActionMenu so rename/delete are user-reachable (AC-2). */
  const handleOpenConversationMenu = (conversation: Conversation) => {
    setActionMenuConversation({ id: conversation.id, title: conversation.title });
    setIsActionMenuOpen(true);
  };

  const executeDelete = async (conversationId: string) => {
    try {
      const isDeletingActive = conversationId === activeConversationId;
      const remaining = conversations.filter((c) => c.id !== conversationId);

      let navigateToId: string | null = null;
      if (isDeletingActive) {
        if (remaining.length === 0) {
          setActiveConversationId(null);
          navigateToId = 'new';
        } else {
          const next = remaining[0];
          setActiveConversationId(next.id);
          navigateToId = next.id;
        }
      }

      // Zero mutator: deleteConversation → table CRUD delete
      await zero.mutate.conversations.delete({ id: conversationId });

      if (navigateToId) {
        router.push(`/chat/${navigateToId}`);
      }
    } catch (err) {
      log('DrawerLayout').error('Failed to delete conversation', err, { id: conversationId });
    }
  };

  const handleRename = async (newTitle: string) => {
    if (!actionMenuConversation) return;
    try {
      // Zero mutator: updateConversation → table CRUD update
      await zero.mutate.conversations.update({
        id: actionMenuConversation.id,
        title: newTitle,
        title_set_by_user: true,
        updated_at: Date.now(),
      });
      setIsActionMenuOpen(false);
    } catch (err) {
      log('DrawerLayout').error('Failed to rename conversation', err, {
        id: actionMenuConversation.id,
        newTitle,
      });
    }
  };

  const handleDelete = async () => {
    if (!actionMenuConversation) return;
    await executeDelete(actionMenuConversation.id);
    setIsActionMenuOpen(false);
  };

  const handleConversationPress = (conversation: Conversation) => {
    setActiveConversationId(conversation.id);
    router.push(`/chat/${conversation.id}`);
  };

  const handleArticlesPress = () => {
    router.push('/articles');
  };

  const handleToolbeltPress = () => {
    router.push('/toolbelt');
  };

  const handleSubscriptionsPress = () => {
    router.push('/subscriptions');
  };

  const handleWhatsNewPress = () => {
    router.push('/whats-new');
  };

  const handleSettingsPress = () => {
    router.push('/settings');
  };

  const handleImprovementsPress = () => {
    router.push('/improvements');
  };

  const conversationsToMap = useMemo(() => {
    if (searchEnabled && searchResults !== undefined) {
      return searchResults;
    }
    return conversations;
  }, [conversations, searchResults, searchEnabled]);

  const mappedConversations: Conversation[] = conversationsToMap.map(mapConversation);

  return (
    <DrawerContent
      conversations={mappedConversations}
      activeConversationId={activeConversationId ?? undefined}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      isSearching={searchEnabled && searchRows === undefined}
      isLoading={false}
      isRenaming={isRenaming}
      isDeleting={isDeleting}
      error={error}
      onNewChatPress={handleNewChatPress}
      onConversationPress={handleConversationPress}
      onConversationDelete={handleConversationDelete}
      onOpenConversationMenu={handleOpenConversationMenu}
      onArticlesPress={handleArticlesPress}
      onSubscriptionsPress={handleSubscriptionsPress}
      onWhatsNewPress={handleWhatsNewPress}
      onToolbeltPress={handleToolbeltPress}
      onSettingsPress={handleSettingsPress}
      onImprovementsPress={handleImprovementsPress}
      onRetry={() => {}}
      actionMenuOpen={isActionMenuOpen}
      actionMenuConversationTitle={actionMenuConversation?.title ?? ''}
      onActionMenuOpenChange={(open) => {
        setIsActionMenuOpen(open);
        if (!open) setActionMenuConversation(null);
      }}
      onRename={handleRename}
      onDelete={handleDelete}
      hasActiveTasks={false}
    />
  );
}

/**
 * Loading screen shown while determining the initial conversation on app launch.
 */
function _InitialLoadingScreen() {
  return (
    <View
      className="bg-background flex-1 items-center justify-center"
      testID="initial-loading-screen"
    >
      <ActivityIndicator size="large" testID="loading-spinner" />
      <Text className="text-muted-foreground mt-4 text-sm">Loading conversations...</Text>
    </View>
  );
}

/**
 * Error screen shown when initial conversation fetch fails.
 */
function _InitialErrorScreen({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  return (
    <View
      className="bg-background flex-1 items-center justify-center gap-4 p-6"
      testID="initial-error-screen"
    >
      <Text className="text-destructive text-center text-lg">Failed to load conversations</Text>
      <Text className="text-muted-foreground text-center text-sm">{error?.message}</Text>
      <Button onPress={onRetry} testID="retry-button">
        <Text>Retry</Text>
      </Button>
    </View>
  );
}

export default function DrawerLayout() {
  const router = useRouter();
  const { colors: themeColors } = useTheme();

  // Zero query for conversations list (conversationsByOwner)
  const [conversationRows] = useQuery(conversationsByOwner());
  const conversations = (conversationRows ?? []) as unknown as ZeroConversationRow[];

  // Active conversation tracking (local state)
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  // Prevent duplicate initialization on re-renders (React 18 Strict Mode)
  const hasInitialized = useRef(false);
  const isInitializing = useRef(false);

  const isLoading = conversationRows === undefined;

  useEffect(() => {
    // On first mount, navigate to /chat/new immediately (optimistic empty state)
    if (!hasInitialized.current && !isInitializing.current) {
      isInitializing.current = true;
      router.replace('/chat/new');
      hasInitialized.current = true;
      isInitializing.current = false;
    }

    // After conversations load, navigate to most recent if any exist
    if (!isLoading && conversations.length > 0 && hasInitialized.current) {
      const mostRecent = conversations[0];
      if (activeConversationId === null) {
        setActiveConversationId(mostRecent.id);
        router.replace(`/chat/${mostRecent.id}`);
      }
    }
  }, [isLoading, conversations, router, activeConversationId]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['left', 'right']} className="bg-background">
      <Drawer
        screenOptions={{
          headerShown: false,
          drawerType: 'slide',
          drawerStyle: { width: '80%', backgroundColor: themeColors.background },
        }}
        drawerContent={CustomDrawerContent}
      >
        <Drawer.Screen
          name="chat/[conversationId]"
          options={{ headerShown: false, title: 'Chat' }}
        />
        <Drawer.Screen
          name="research/[sessionId]"
          options={{ headerShown: false, title: 'Research Details' }}
        />
        <Drawer.Screen name="articles" options={{ headerShown: false, title: 'Articles' }} />
        <Drawer.Screen name="toolbelt" options={{ headerShown: false, title: 'Toolbelt' }} />
        <Drawer.Screen
          name="subscriptions"
          options={{ headerShown: false, title: 'Subscriptions' }}
        />
        <Drawer.Screen
          name="subscriptions/settings"
          options={{ headerShown: false, title: 'Subscription Settings' }}
        />
        <Drawer.Screen
          name="subscriptions/social"
          options={{ headerShown: false, title: 'Community Posts' }}
        />
        <Drawer.Screen
          name="subscription-content/[groupKey]"
          options={{ headerShown: false, title: 'Subscription Content' }}
        />
        <Drawer.Screen
          name="whats-new/index"
          options={{ headerShown: false, title: "What's New" }}
        />
        <Drawer.Screen
          name="whats-new/[reportId]"
          options={{ headerShown: false, title: "What's New Report" }}
        />
        <Drawer.Screen name="settings" options={{ headerShown: false, title: 'Settings' }} />
        <Drawer.Screen
          name="improvements"
          options={{ headerShown: false, title: 'Improvements' }}
        />
        <Drawer.Screen
          name="improvements/[requestId]"
          options={{ headerShown: false, title: 'Improvement Details' }}
        />
      </Drawer>
    </SafeAreaView>
  );
}
