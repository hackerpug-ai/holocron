import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useQuery, useZero } from '@rocicorp/zero/react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mutators } from '@/app/zero/mutators';
import { conversationById, conversationsByOwner } from '@/app/zero/queries';
import { ChatInput } from '@/components/chat/ChatInput';
import { ChatThread } from '@/components/chat/ChatThread';
import { Button } from '@/components/ui/button';
import { SquarePen } from '@/components/ui/icons';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { Text } from '@/components/ui/text';
import { VoiceAssistantOverlay } from '@/components/voice/VoiceAssistantOverlay';
import { useChatHistory } from '@/hooks/use-chat-history';
import { useVoiceSession } from '@/hooks/use-voice-session';
import { spacing } from '@/lib/theme';

const platformUrl = process.env.EXPO_PUBLIC_PLATFORM_URL;
const rnApiKey = process.env.EXPO_PUBLIC_RN_API_KEY;

type ZeroConversationRow = {
  id: string;
  title?: string | null;
  agent_busy?: boolean | null;
  last_message_preview?: string | null;
  created_at: number;
  updated_at: number;
};

type ChatRunCreateResponse = {
  runId?: string;
  conversationId?: string;
  status?: string;
  ok?: boolean;
};

function newRequestId(prefix: string): string {
  const rand =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rand}`;
}

/**
 * Chat screen for a specific conversation.
 * Route: /chat/[conversationId]
 *
 * Reads: Zero queries (conversations + chat_messages).
 * Writes: Zero mutators (soft-delete) + Hono commands (send / cancel).
 */
export default function ChatScreen() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const zero = useZero();

  const isNewConversation = conversationId === 'new';

  // Zero: conversations list
  const [conversationRows] = useQuery(conversationsByOwner());
  const conversations = (conversationRows ?? []) as unknown as ZeroConversationRow[];

  // Zero: single conversation (conversationById)
  const [conversation] = useQuery(
    !isNewConversation && conversationId ? conversationById(conversationId) : undefined
  );
  const conversationRow = conversation as unknown as ZeroConversationRow | undefined;

  const [_activeConversationId, setActiveConversationId] = useState<string | null>(null);

  const chatHistoryId = isNewConversation ? null : (conversationId ?? null);
  const {
    messages = [],
    isLoading: isLoadingMessages = false,
    error: messagesError = null,
  } = useChatHistory(chatHistoryId) ?? { messages: [], isLoading: false, error: null };

  // Active Hono chat-run id for cancel (AC-5)
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  // Local send state
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<Error | null>(null);
  const lastMessageRef = useRef<string | null>(null);

  const agentBusy = Boolean(conversationRow?.agent_busy) || isStreaming;
  const streamingMessageId = agentBusy
    ? (messages.find((m) => m.role === 'agent')?.id ?? null)
    : null;

  const softDeleteMessage = useCallback(
    async (messageId: string) => {
      await zero.mutate(mutators.softDeleteChatMessage({ id: messageId }));
    },
    [zero]
  );

  const handleSend = useCallback(
    async (content: string) => {
      if (!content.trim() || isSending) return;
      if (!platformUrl || !rnApiKey) {
        setSendError(new Error('Platform URL or RN API key is not configured'));
        return;
      }

      Keyboard.dismiss();
      lastMessageRef.current = content.trim();
      setIsSending(true);
      setSendError(null);

      try {
        const targetConversationId =
          isNewConversation || !conversationId ? undefined : conversationId;

        const response = await fetch(`${platformUrl}/api/chat-runs`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${rnApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestId: newRequestId('rn-chat'),
            msg: content.trim(),
            conversationId: targetConversationId,
          }),
        });

        if (!response.ok) {
          throw new Error(`chat run create failed: ${response.status}`);
        }

        const body = (await response.json()) as ChatRunCreateResponse;
        if (body.runId) {
          setActiveRunId(body.runId);
          setIsStreaming(true);
        }

        if (isNewConversation && body.conversationId) {
          router.replace(`/chat/${body.conversationId}`);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to send message');
        setSendError(error);
        setIsStreaming(false);
        setActiveRunId(null);
      } finally {
        setIsSending(false);
      }
    },
    [conversationId, isSending, isNewConversation, router, zero]
  );

  const handleCancelAgent = useCallback(async () => {
    if (!platformUrl || !rnApiKey) return;
    const runId = activeRunId;
    if (!runId) {
      // Fallback: clear local busy flags even if run id is unknown
      setIsStreaming(false);
      return;
    }

    try {
      await fetch(`${platformUrl}/api/chat-runs/${runId}/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rnApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    } finally {
      setIsStreaming(false);
      setActiveRunId(null);
    }
  }, [activeRunId, conversationId, isNewConversation, zero]);

  // Clear streaming flag when agent_busy clears via Zero sync
  useEffect(() => {
    if (conversationRow && conversationRow.agent_busy === false && isStreaming) {
      setIsStreaming(false);
      setActiveRunId(null);
    }
  }, [conversationRow, isStreaming]);

  const handleRetry = useCallback(() => {
    setSendError(null);
    if (lastMessageRef.current) {
      handleSend(lastMessageRef.current);
    }
  }, [handleSend]);

  const handleFinalResultPress = (sessionId: string) => {
    router.push(`/research/${sessionId}`);
  };

  const handleWhatsNewReportPress = (reportId: string) => {
    router.push(`/whats-new/${reportId}`);
  };

  const handleDocumentContextNavigate = (documentId: string, blockIndex?: number) => {
    const params =
      blockIndex !== undefined
        ? `/document/${documentId}?highlightBlock=${blockIndex}`
        : `/document/${documentId}`;
    router.push(params);
  };

  const handleOpenMenu = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const handleNewChat = () => {
    router.push('/chat/new');
  };

  const voiceConversationId = (isNewConversation ? '' : (conversationId ?? '')) as never;
  const {
    state: voiceState,
    start: startVoice,
    stop: stopVoice,
    mute,
    unmute,
    audioLevel,
    isWarm,
    prewarm: prewarmVoice,
  } = useVoiceSession(voiceConversationId);

  const isMuted = voiceState.status === 'muted';
  const toggleMute = () => {
    if (isMuted) {
      unmute();
    } else {
      mute();
    }
  };

  useEffect(() => {
    if (conversationId && !isNewConversation) {
      setActiveConversationId(conversationId);
    }
  }, [conversationId, isNewConversation]);

  useEffect(() => {
    // Redirect if conversation missing after list is known
    if (
      !isNewConversation &&
      conversationId &&
      conversation === undefined &&
      conversationRows !== undefined &&
      conversations.length > 0 &&
      !conversations.some((c) => c.id === conversationId)
    ) {
      // still loading singular query — wait
    }
    if (!isNewConversation && conversationId && conversation === null) {
      router.replace('/chat/new');
    }
  }, [conversationId, conversation, isNewConversation, conversations, conversationRows, router]);

  const isLoading = conversationRows === undefined;

  const conversationExists =
    isNewConversation ||
    conversations.some((c) => c.id === conversationId) ||
    Boolean(conversationRow);

  if (isLoading && !isNewConversation) {
    return (
      <View
        style={styles.centerContainer}
        className="bg-background p-6"
        testID="chat-loading-screen"
      >
        <ActivityIndicator size="large" testID="loading-spinner" />
        <Text className="text-muted-foreground mt-4 text-sm">Loading conversation...</Text>
      </View>
    );
  }

  if (messagesError) {
    return (
      <View style={styles.centerContainer} className="bg-background p-6" testID="chat-error-screen">
        <Text className="text-destructive text-center text-lg">Failed to load conversation</Text>
        <Text className="text-muted-foreground text-center text-sm mt-2">
          {messagesError.message}
        </Text>
        <Button onPress={() => router.push('/')} testID="go-home-button" className="mt-4">
          <Text>Go to Home</Text>
        </Button>
      </View>
    );
  }

  if (
    !conversationExists &&
    conversationId &&
    !isNewConversation &&
    conversationRows !== undefined
  ) {
    // Give Zero a beat: if list has rows but not this id, show not found
    if (conversations.length > 0 && !conversations.some((c) => c.id === conversationId)) {
      return (
        <View
          style={styles.centerContainer}
          className="bg-background p-6"
          testID="chat-not-found-screen"
        >
          <Text className="text-destructive text-center text-lg">Conversation not found</Text>
          <Text className="text-muted-foreground text-center text-sm mt-2">
            The conversation you're looking for doesn't exist or has been deleted.
          </Text>
          <Button onPress={() => router.push('/')} testID="go-home-button" className="mt-4">
            <Text>Go to Home</Text>
          </Button>
        </View>
      );
    }
  }

  const contentTopPadding = spacing.lg;

  return (
    <ScreenLayout edges="none" testID="chat-conversation-layout">
      <KeyboardAvoidingView
        style={styles.container}
        className="bg-background"
        testID="chat-screen"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScreenHeader
          showMenu
          onMenu={handleOpenMenu}
          rightContent={
            <Pressable
              onPress={handleNewChat}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-muted"
              testID="chat-header-new-chat-button"
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <SquarePen size={22} className="text-foreground" />
            </Pressable>
          }
          testID="chat-header"
        />
        <View style={styles.chatContent}>
          <ChatThread
            messages={messages}
            showTypingIndicator={isSending || agentBusy}
            isLoading={isLoadingMessages}
            safeAreaTop={contentTopPadding}
            testID="chat-thread"
            onFinalResultPress={handleFinalResultPress}
            onWhatsNewReportPress={handleWhatsNewReportPress}
            onDocumentContextNavigate={handleDocumentContextNavigate}
            onDeleteMessage={(messageId) => {
              void softDeleteMessage(messageId);
            }}
            streamingMessageId={streamingMessageId}
          />
        </View>

        <VoiceAssistantOverlay
          state={voiceState}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onStop={stopVoice}
          onDismiss={stopVoice}
          onRetry={startVoice}
          audioLevel={audioLevel}
          testID="voice-assistant-overlay"
        />
        <View style={{ paddingBottom: insets.bottom }}>
          {sendError && (
            <View
              className="bg-destructive/10 px-4 py-2 flex-row items-center justify-between"
              testID="error-banner"
            >
              <Text className="text-destructive">Failed to send message</Text>
              <Pressable
                onPress={handleRetry}
                testID="error-retry-button"
                accessibilityRole="button"
                accessibilityLabel="Retry"
              >
                <Text className="text-primary">Retry</Text>
              </Pressable>
            </View>
          )}
          {agentBusy && (
            <View className="items-center py-1" testID="stop-generating-container">
              <Pressable
                onPress={() => {
                  void handleCancelAgent();
                }}
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-border active:bg-muted"
                testID="stop-generating-button"
                accessibilityRole="button"
                accessibilityLabel="Stop generating"
              >
                <Text className="text-sm text-muted-foreground">Stop generating</Text>
              </Pressable>
            </View>
          )}
          <ChatInput
            onSend={handleSend}
            disabled={isSending || agentBusy}
            testID="chat-input"
            showVoiceButton={!isNewConversation}
            voiceState={voiceState.status}
            onVoiceStart={startVoice}
            onVoiceStop={stopVoice}
            isWarm={isWarm}
            onVoicePrewarm={prewarmVoice}
          />
        </View>
      </KeyboardAvoidingView>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatContent: {
    flex: 1,
  },
});
