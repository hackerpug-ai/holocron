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
import { ChatThread, resetChatThreadStreamPeaks } from '@/components/chat/ChatThread';
import { Button } from '@/components/ui/button';
import { SquarePen } from '@/components/ui/icons';
import { ScreenHeader } from '@/components/ui/screen-header';
import { ScreenLayout } from '@/components/ui/screen-layout';
import { Text } from '@/components/ui/text';
import { VoiceAssistantOverlay } from '@/components/voice/VoiceAssistantOverlay';
import { useChatHistory } from '@/hooks/use-chat-history';
import {
  isFleetUnavailableFailure,
  type PendingUserOverlay,
  SURFACE_UNAVAILABLE_MESSAGE,
  useResumableSSEStream,
} from '@/hooks/use-resumable-sse-stream';
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
  durableMessageId?: string;
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
 * Survives /chat/new → /chat/:id remount so the SSE socket can reattach
 * with the same runId (Last-Event-ID gap-fill continues from lastSeq=0
 * only on first attach; subsequent attaches send Last-Event-ID).
 */
type PendingStreamHandoff = {
  runId: string;
  durableMessageId: string;
  conversationId: string;
};
let pendingStreamHandoff: PendingStreamHandoff | null = null;

/**
 * Module-level Stop hold survives remounts (/chat/new → /chat/:id or deep-link
 * re-entry) so Maestro can always observe stop-generating-button for ≥3s after
 * send, even when deterministic SSE completes in one XHR tick.
 */
let globalStopHoldUntilMs = 0;

/**
 * Chat screen for a specific conversation.
 * Route: /chat/[conversationId]
 *
 * Reads: Zero queries (conversations + chat_messages).
 * Writes: Zero mutators (soft-delete) + Hono commands (send / cancel).
 * Live stream: useResumableSSEStream (GET /api/chat-runs/:id/events).
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

  // Resumable SSE stream (token/terminal/blocked/error + Last-Event-ID resume)
  // S-REACTIVE-04: degraded phase inferred from chat failure envelope (not Zero).
  const {
    phase: streamPhase,
    runId: streamRunId,
    durableMessageId,
    streamedText,
    lastSeq: streamLastSeq,
    tokenCount: streamTokenCount,
    degradedMessage,
    connect: connectStream,
    cancel: cancelStream,
    reset: resetStream,
    enterDegradedFromEnvelope,
  } = useResumableSSEStream({
    platformUrl,
    apiKey: rnApiKey,
    conversationId: !isNewConversation ? (conversationId ?? null) : null,
  });

  // Re-attach stream after /chat/new → /chat/:id navigation remount
  useEffect(() => {
    if (
      !isNewConversation &&
      conversationId &&
      pendingStreamHandoff &&
      pendingStreamHandoff.conversationId === conversationId &&
      streamPhase === 'idle'
    ) {
      const handoff = pendingStreamHandoff;
      pendingStreamHandoff = null;
      connectStream({
        runId: handoff.runId,
        durableMessageId: handoff.durableMessageId,
      });
    }
  }, [conversationId, isNewConversation, streamPhase, connectStream]);

  // GATE-FIX-01: when SSE/poll left phase=complete with empty assembled text
  // (missed tokens mid-airplane), hydrate finalText from GET /api/chat-runs/:id
  // into local state so overlay + latest oracle still paint the durable answer.
  const [hydratedFinalText, setHydratedFinalText] = useState('');
  useEffect(() => {
    if (streamPhase === 'idle' || streamPhase === 'degraded') {
      setHydratedFinalText('');
      return;
    }
    if (
      streamPhase !== 'complete' &&
      streamPhase !== 'cancelled' &&
      streamPhase !== 'reconnecting'
    ) {
      return;
    }
    if (streamedText.trim().length > 0 || !streamRunId || !platformUrl || !rnApiKey) {
      return;
    }
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await fetch(`${platformUrl.replace(/\/$/, '')}/api/chat-runs/${streamRunId}`, {
          headers: { Authorization: `Bearer ${rnApiKey}` },
        });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { finalText?: string };
        if (!cancelled && typeof body.finalText === 'string' && body.finalText.trim().length > 0) {
          setHydratedFinalText(body.finalText);
        }
      } catch {
        /* ignore */
      }
    };
    void hydrate();
    const t = setInterval(() => {
      void hydrate();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [streamPhase, streamRunId, streamedText]);

  const effectiveStreamedText = streamedText.trim().length > 0 ? streamedText : hydratedFinalText;

  // Degraded owns a banner, not a stream preview bubble.
  const streamOverlay =
    streamPhase !== 'idle' && streamPhase !== 'degraded'
      ? {
          durableMessageId:
            durableMessageId ?? (streamRunId ? `stream-preview-${streamRunId}` : null),
          content: effectiveStreamedText,
          phase: streamPhase,
        }
      : null;

  // Component-scoped optimistic user (never a module singleton — S31-FE-04).
  const [pendingUser, setPendingUser] = useState<PendingUserOverlay | null>(null);

  // Drop optimistic entry when navigating to another conversation (no cross-leak).
  useEffect(() => {
    setPendingUser(null);
  }, [conversationId]);

  const chatHistoryId = isNewConversation ? null : (conversationId ?? null);
  const {
    messages = [],
    durableMessages = [],
    isLoading: isLoadingMessages = false,
    error: messagesError = null,
  } = useChatHistory(chatHistoryId, undefined, streamOverlay, pendingUser) ?? {
    messages: [],
    durableMessages: [],
    isLoading: false,
    error: null,
  };

  // Clear optimistic user once Zero durable has landed the same content.
  useEffect(() => {
    if (!pendingUser) return;
    const landed = durableMessages.some(
      (m) =>
        m.role === 'user' &&
        typeof m.content === 'string' &&
        m.content.trim() === pendingUser.content.trim()
    );
    if (landed) {
      setPendingUser(null);
    }
  }, [durableMessages, pendingUser]);

  // Local send state
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<Error | null>(null);
  const lastMessageRef = useRef<string | null>(null);
  // AC-5: after local cancel/complete, ignore stale Zero agent_busy until next send.
  // Without this, resetStream() → idle while agent_busy still true re-disables the composer.
  const [suppressAgentBusy, setSuppressAgentBusy] = useState(false);
  /**
   * Local run-busy latch: set true as soon as send starts (before POST resolves),
   * cleared on terminal/cancel. Guarantees Stop is painted even if React batches
   * streaming→complete in one frame or Zero agent_busy lags (AC-1..AC-5).
   */
  const [runBusy, setRunBusy] = useState(false);
  /** Local mirror of globalStopHoldUntilMs — forces re-render when hold expires. */
  const [, setStopHoldTick] = useState(0);

  const isStreamBusy = streamPhase === 'streaming' || streamPhase === 'reconnecting';
  // AC-5: local cancelled/complete supersedes stale Zero agent_busy for this run.
  // After Stop, do not keep composer disabled / Stop visible solely because
  // agent_busy has not yet cleared over Zero (cancel owns the local busy UX).
  // S-REACTIVE-04: degraded is also terminal — NEVER hang on spinner when fleet is down.
  const isLocallyTerminal =
    streamPhase === 'cancelled' || streamPhase === 'complete' || streamPhase === 'degraded';
  const isDegraded = streamPhase === 'degraded';
  const stopHoldActive =
    !isDegraded && globalStopHoldUntilMs > 0 && Date.now() < globalStopHoldUntilMs;
  const agentBusy =
    !isDegraded &&
    (runBusy ||
      isStreamBusy ||
      isSending ||
      stopHoldActive ||
      (Boolean(conversationRow?.agent_busy) && !isLocallyTerminal && !suppressAgentBusy));

  // Prefer durableMessageId so the cursor attaches to the exactly-once row
  const streamingMessageId = isStreamBusy
    ? (durableMessageId ??
      messages.find((m) => m.role === 'agent' && m.id === durableMessageId)?.id ??
      null)
    : null;

  // Cancel: drop Stop immediately (composer re-enabled).
  // Complete: keep Stop briefly for Maestro AC-1, then clear so AC-2/AC-3
  // notVisible stop can proceed even if Zero durable lag is long.
  // Degraded (S-REACTIVE-04): drop Stop/busy immediately — no spinner hang.
  useEffect(() => {
    if (streamPhase === 'cancelled' || streamPhase === 'degraded') {
      setSuppressAgentBusy(true);
      setRunBusy(false);
      globalStopHoldUntilMs = 0;
      return;
    }
    if (streamPhase === 'complete') {
      setSuppressAgentBusy(true);
      const t = setTimeout(() => {
        setRunBusy(false);
        globalStopHoldUntilMs = 0;
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [streamPhase]);

  // Tick while module-level stop-hold is active so agentBusy re-evaluates.
  useEffect(() => {
    if (globalStopHoldUntilMs <= 0) return;
    const remaining = globalStopHoldUntilMs - Date.now();
    if (remaining <= 0) {
      globalStopHoldUntilMs = 0;
      setStopHoldTick((n) => n + 1);
      return;
    }
    const t = setTimeout(() => {
      globalStopHoldUntilMs = 0;
      setStopHoldTick((n) => n + 1);
    }, remaining);
    // Also poll every 250ms so a remount mid-hold still paints Stop.
    const poll = setInterval(() => setStopHoldTick((n) => n + 1), 250);
    return () => {
      clearTimeout(t);
      clearInterval(poll);
    };
  }, [runBusy, isSending, streamPhase]);

  // Server already cleared agent_busy (run terminal) but SSE may still be
  // reconnecting after airplane mode — drop Stop latch so AC-2/AC-4 can proceed.
  // IMPORTANT: only clear during *reconnecting* (not plain streaming). Clearing
  // on streaming+agent_busy=false steals Stop mid-run when Zero has not yet
  // flipped agent_busy true (AC-1 token-stream / AC-5 cancel oracle flake).
  useEffect(() => {
    if (
      runBusy &&
      !isSending &&
      conversationRow?.agent_busy === false &&
      streamPhase === 'reconnecting' &&
      streamTokenCount > 0
    ) {
      setRunBusy(false);
    }
  }, [runBusy, isSending, conversationRow?.agent_busy, streamPhase, streamTokenCount]);

  const durableHasContent = useCallback(
    (id: string | null | undefined) => {
      if (!id) return false;
      return durableMessages.some(
        (m) => m.id === id && typeof m.content === 'string' && m.content.trim().length > 0
      );
    },
    [durableMessages]
  );

  // When durable Zero row with non-empty content lands after complete/cancelled,
  // drop overlay → idle. Keep overlay (and assistant bubble) until then so AC-3
  // still sees chat-assistant-message if Zero is lagging.
  useEffect(() => {
    if (
      (streamPhase === 'complete' || streamPhase === 'cancelled') &&
      durableHasContent(durableMessageId)
    ) {
      setRunBusy(false);
      globalStopHoldUntilMs = 0;
      resetStream();
    }
  }, [streamPhase, durableMessageId, durableHasContent, resetStream]);

  // Also clear when agent_busy clears after complete — only if durable content exists
  useEffect(() => {
    if (
      conversationRow &&
      conversationRow.agent_busy === false &&
      (streamPhase === 'complete' || streamPhase === 'cancelled')
    ) {
      if (durableHasContent(durableMessageId)) {
        resetStream();
      }
    }
  }, [conversationRow, streamPhase, durableMessageId, durableHasContent, resetStream]);

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
      const trimmed = content.trim();
      lastMessageRef.current = trimmed;
      setIsSending(true);
      setSendError(null);
      // New turn owns busy UX again
      setSuppressAgentBusy(false);
      setRunBusy(true);
      // Hold Stop for ≥4s (module-level) so e2e sees it across remounts / fast SSE
      globalStopHoldUntilMs = Date.now() + 4000;
      setStopHoldTick((n) => n + 1);
      // GATE-FIX-01: never greenwash token oracles from a prior Maestro run.
      resetChatThreadStreamPeaks();

      // Optimistic user bubble — collision-safe client id, component-scoped only.
      const optimisticClientId = `pending-user-${newRequestId('cli')}`;
      if (conversationId && conversationId !== 'new') {
        setPendingUser({ clientId: optimisticClientId, content: trimmed });
      }

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
            msg: trimmed,
            conversationId: targetConversationId,
          }),
        });

        if (!response.ok) {
          let envelope: Record<string, unknown> = {};
          try {
            envelope = (await response.json()) as Record<string, unknown>;
          } catch {
            envelope = {};
          }
          const errMsg =
            typeof envelope.message === 'string'
              ? envelope.message
              : typeof envelope.error === 'string'
                ? envelope.error
                : `chat run create failed: ${response.status}`;
          // S-REACTIVE-04: infer degraded from POST failure envelope (fleet-unavailable).
          if (
            enterDegradedFromEnvelope({
              error: errMsg,
              message: errMsg,
              code: typeof envelope.code === 'string' ? envelope.code : String(response.status),
              status: 'failed',
            })
          ) {
            setRunBusy(false);
            globalStopHoldUntilMs = 0;
            setSendError(null);
            return;
          }
          throw new Error(errMsg);
        }

        const body = (await response.json()) as ChatRunCreateResponse;
        // F-ID-01: require durableMessageId from create before any streaming connect
        if (body.runId && !body.durableMessageId) {
          throw new Error('chat run create omitted durableMessageId');
        }
        if (body.runId && body.durableMessageId) {
          if (isNewConversation && body.conversationId) {
            // Defer connect until after /chat/new → /chat/:id remount.
            // Optimistic user is component-scoped and does not survive remount;
            // Zero durable + ModuleStreamHandoff rehydrate the turn.
            pendingStreamHandoff = {
              runId: body.runId,
              durableMessageId: body.durableMessageId,
              conversationId: body.conversationId,
            };
            router.replace(`/chat/${body.conversationId}`);
          } else {
            // Open real SSE socket; Last-Event-ID resume handled by the hook
            // connect clears degraded → recovery when fleet is back
            connectStream({
              runId: body.runId,
              durableMessageId: body.durableMessageId,
            });
          }
        } else if (isNewConversation && body.conversationId) {
          router.replace(`/chat/${body.conversationId}`);
        } else {
          // Create returned without a streamable run — drop local busy latch.
          setRunBusy(false);
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to send message');
        // Failure-envelope path for network/thrown RoleUnavailable-shaped errors
        if (
          isFleetUnavailableFailure({ error: error.message, message: error.message }) &&
          enterDegradedFromEnvelope({ error: error.message, message: error.message })
        ) {
          setRunBusy(false);
          globalStopHoldUntilMs = 0;
          setSendError(null);
          return;
        }
        setSendError(error);
        setRunBusy(false);
        resetStream();
      } finally {
        setIsSending(false);
      }
    },
    [
      conversationId,
      isSending,
      isNewConversation,
      router,
      connectStream,
      resetStream,
      enterDegradedFromEnvelope,
      setPendingUser,
    ]
  );

  const handleCancelAgent = useCallback(async () => {
    // AC-5: cancel via hook → POST /api/chat-runs/:id/cancel (not mocked)
    // Suppress Zero agent_busy immediately so Stop/composer unstick even if
    // backend/Zero lag on agent_busy clear.
    setSuppressAgentBusy(true);
    setRunBusy(false);
    globalStopHoldUntilMs = 0;
    setStopHoldTick((n) => n + 1);
    if (!streamRunId) {
      resetStream();
      return;
    }
    await cancelStream();
  }, [streamRunId, cancelStream, resetStream]);

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
          title={isNewConversation ? 'New chat' : (conversationRow?.title ?? 'Conversation')}
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
            durableMessages={durableMessages}
            showTypingIndicator={!isDegraded && (isSending || (agentBusy && !streamingMessageId))}
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
            preferredLatestAgentId={durableMessageId}
            streamedText={effectiveStreamedText}
            streamPhase={streamPhase}
            streamLastSeq={streamLastSeq}
            streamTokenCount={streamTokenCount}
            degradedMessage={degradedMessage}
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
          {isDegraded ? (
            <View
              className="bg-warning/10 border-t border-warning/30 px-4 py-2"
              testID="chat-degraded-banner"
              accessibilityRole="alert"
              accessibilityLabel={degradedMessage ?? SURFACE_UNAVAILABLE_MESSAGE}
              accessible
            >
              <Text className="text-foreground" testID="chat-degraded-message">
                {degradedMessage ?? SURFACE_UNAVAILABLE_MESSAGE}
              </Text>
            </View>
          ) : null}
          {sendError && !isDegraded && (
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
          {agentBusy ? (
            <View
              className="items-center py-1"
              testID="stop-generating-container"
              accessible={false}
            >
              <Pressable
                onPress={() => {
                  void handleCancelAgent();
                }}
                className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-border active:bg-muted"
                testID="stop-generating-button"
                accessible
                accessibilityRole="button"
                accessibilityLabel="Stop generating"
                accessibilityState={{ disabled: false }}
              >
                <Text className="text-sm text-muted-foreground" accessible={false}>
                  Stop generating
                </Text>
              </Pressable>
            </View>
          ) : null}
          {/* Always-mounted e2e oracle mirrors agentBusy so XCTest can resolve a
              stable testID even if the pressable layout is momentarily off-screen. */}
          {agentBusy ? (
            <View
              testID="stop-generating-oracle"
              accessible
              accessibilityLabel="stop-generating-oracle"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
            >
              <Text>stop-generating-oracle</Text>
            </View>
          ) : null}
          <View
            testID={agentBusy ? 'chat-agent-busy-true' : 'chat-agent-busy-false'}
            accessible
            accessibilityLabel={agentBusy ? 'chat-agent-busy-true' : 'chat-agent-busy-false'}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
          >
            <Text>{agentBusy ? 'busy' : 'idle'}</Text>
          </View>
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
