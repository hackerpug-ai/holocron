import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, useWindowDimensions, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useAgentActivity } from '@/hooks/use-agent-activity';
import {
  type ChatStreamPhase,
  SURFACE_UNAVAILABLE_MESSAGE,
} from '@/hooks/use-resumable-sse-stream';
import type { MessageRole, MessageType } from '@/lib/types/conversations';
import { AgentActivityIndicator } from './AgentActivityIndicator';
import {
  durableContentForMessageId,
  resolveChatContentByteEqualOracleId,
} from './chat-content-byte-equal';
import { MessageActionsSheet } from './MessageActionsSheet';
import { MessageBubble } from './MessageBubble';
import { selectLatestAgentMessage } from './select-latest-agent';
import { TypingIndicator } from './TypingIndicator';

export {
  type ChatContentByteEqualOracleId,
  chatContentsAreByteEqual,
  durableContentForMessageId,
  resolveChatContentByteEqualOracleId,
} from './chat-content-byte-equal';
export { selectLatestAgentMessage } from './select-latest-agent';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  message_type?: MessageType;
  card_data?: Record<string, unknown> | null;
  toolCallId?: string | null;
  voiceSessionId?: string | null;
  createdAt: Date;
}

/**
 * Module-level high-water marks survive ChatThread remounts (Zero list reconcile,
 * deep-link re-entry) the same way globalStopHoldUntilMs survives chat remounts.
 * Parent resetStream() zeros live lastSeq/tokenCount; peaks retain turn max so
 * Maestro at-least-N oracles still resolve after durable complete (REDHAT-FIX-03).
 */
let modulePeakLastSeq = 0;
let modulePeakTokenCount = 0;

/** GATE-FIX-01: clear stale peaks so a prior Maestro run cannot greenwash token oracles. */
export function resetChatThreadStreamPeaks(): void {
  modulePeakLastSeq = 0;
  modulePeakTokenCount = 0;
}

export interface ChatThreadProps {
  messages: ChatMessage[];
  /**
   * Durable Zero/chat_messages rows only (no SSE overlay).
   * REDHAT-FIX-11: compared to rendered latest-agent content for
   * chat-content-byte-equal / chat-content-byte-mismatch Maestro oracles.
   */
  durableMessages?: ChatMessage[];
  showTypingIndicator?: boolean;
  /** Initial loading state - shows subtle inline loader */
  isLoading?: boolean;
  /** Safe area top inset to apply as padding */
  safeAreaTop?: number;
  testID?: string;
  /** Callback when a final result card is pressed - navigate to research detail */
  onFinalResultPress?: (sessionId: string) => void;
  /** Callback when a What's New report card is pressed - navigate to report detail */
  onWhatsNewReportPress?: (reportId: string) => void;
  /** Callback when a message is deleted */
  onDeleteMessage?: (messageId: string) => void;
  /** ID of the message currently being streamed - shows cursor, suppresses typing indicator */
  streamingMessageId?: string | null;
  /**
   * Active-turn durable agent id (SSE run). GATE-FIX-01: when set and the row
   * has content, it owns chat-assistant-message-latest so seed never steals
   * the success selector during a live/complete turn.
   */
  preferredLatestAgentId?: string | null;
  /**
   * Live SSE assembled text (same source as stream overlay). GATE-FIX-01:
   * used to mount a fail-safe latest oracle when FlatList rows are empty due
   * to Zero lag / empty placeholders after airplane restore.
   */
  streamedText?: string;
  /**
   * Unified chat-thread stream state machine (S-REACTIVE-01 / S-REACTIVE-04).
   * idle | streaming | reconnecting | complete | cancelled | degraded
   */
  streamPhase?: ChatStreamPhase;
  /** Last SSE seq observed (Last-Event-ID resume cursor) — for e2e oracles */
  streamLastSeq?: number;
  /** Count of applied token events (zero-dup invariant) */
  streamTokenCount?: number;
  /**
   * Exact SURFACE_UNAVAILABLE_MESSAGE when streamPhase === 'degraded'.
   * Inferred from the chat failure envelope — never a Zero query.
   */
  degradedMessage?: string | null;
  /** Navigate to a document with optional highlight at a specific block */
  onDocumentContextNavigate?: (documentId: string, blockIndex?: number) => void;
  /** Callback when a single recommendation is saved to KB */
  onSaveRecommendation?: (item: {
    id: string;
    title: string;
    description?: string;
    url?: string;
  }) => void;
  /** Callback when all recommendations in a list are saved to KB */
  onSaveRecommendationList?: (
    items: { id: string; title: string; description?: string; url?: string }[]
  ) => void;
  /** Callback when a clarification quick reply is tapped - sends message as user */
  onSendMessage?: (text: string) => void;
}

export function ChatThread({
  messages,
  durableMessages = [],
  showTypingIndicator = false,
  isLoading = false,
  safeAreaTop = 0,
  testID = 'chat-thread',
  onFinalResultPress,
  onWhatsNewReportPress,
  onDeleteMessage,
  streamingMessageId = null,
  preferredLatestAgentId = null,
  streamedText = '',
  streamPhase = 'idle',
  streamLastSeq = 0,
  streamTokenCount = 0,
  degradedMessage = null,
  onDocumentContextNavigate,
  onSaveRecommendation,
  onSaveRecommendationList,
  onSendMessage,
}: ChatThreadProps) {
  const { width: _screenWidth } = useWindowDimensions();

  // Bottom sheet state for message actions
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedMessageContent, setSelectedMessageContent] = useState<string | null>(null);

  // Check if the most recent message has an active research loading card
  // If so, suppress the typing indicator to avoid showing double loaders
  const hasActiveResearchCard =
    messages.length > 0 &&
    (() => {
      // Newest by createdAt (not array order — listData is sorted separately).
      let newest = messages[0]!;
      for (const m of messages) {
        if (m.createdAt.getTime() >= newest.createdAt.getTime()) newest = m;
      }
      if (newest?.message_type === 'result_card' && newest?.card_data) {
        const cardType = newest.card_data.card_type;
        const status = newest.card_data.status;
        // Active research card is one that's loading (not completed)
        return cardType === 'deep_research_loading' && status !== 'completed';
      }
      return false;
    })();

  const isStreamLive = streamPhase === 'streaming' || streamPhase === 'reconnecting';
  const effectiveShowTypingIndicator =
    showTypingIndicator && !hasActiveResearchCard && !streamingMessageId && !isStreamLive;
  const flatListRef = useRef<FlatList>(null);
  const router = useRouter();

  // High-water marks for Maestro numeric oracles (REDHAT-FIX-03 AC-3).
  // Module-level peaks survive remount + resetStream; only grow (at-least-N).
  const [, setPeakTick] = useState(0);
  useEffect(() => {
    let changed = false;
    if (streamTokenCount > modulePeakTokenCount) {
      modulePeakTokenCount = streamTokenCount;
      changed = true;
    }
    // lastSeq advances 1:1 with applied tokens; also take explicit lastSeq
    const seqCandidate = Math.max(streamLastSeq, streamTokenCount);
    if (seqCandidate > modulePeakLastSeq) {
      modulePeakLastSeq = seqCandidate;
      changed = true;
    }
    if (changed) {
      setPeakTick((n) => n + 1);
    }
  }, [streamPhase, streamLastSeq, streamTokenCount]);
  const oracleTokenCount = Math.max(streamTokenCount, modulePeakTokenCount);
  const oracleLastSeq = Math.max(streamLastSeq, modulePeakLastSeq, oracleTokenCount);

  // Subscribe to agent activity for phase-aware indicator
  const { phase, toolName } = useAgentActivity({ threadId: undefined });
  const aaiActive = phase !== 'idle';

  // Newest-first data for inverted FlatList: index 0 sits at the visual bottom
  // (near the composer). Oldest→newest + inverted wrongly parks live turns OFF
  // the top of the screen (GATE-FIX-01 product: empty yellow / seed-only viewport).
  const listData = (() => {
    const copy = messages.slice();
    copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return copy;
  })();

  // Handle card press - navigate to document screen
  const handleCardPress = useCallback(
    (documentId: string) => {
      router.push(`/document/${documentId}`);
    },
    [router]
  );

  const handleMessageLongPress = useCallback((messageId: string, content: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMessageId(messageId);
    setSelectedMessageContent(content);
    setActionSheetVisible(true);
  }, []);

  const handleDeleteFromSheet = useCallback(() => {
    if (selectedMessageId && onDeleteMessage) {
      onDeleteMessage(selectedMessageId);
    }
    setSelectedMessageId(null);
  }, [selectedMessageId, onDeleteMessage]);

  const handleSheetClose = useCallback(() => {
    setActionSheetVisible(false);
    setSelectedMessageId(null);
    setSelectedMessageContent(null);
  }, []);

  // GATE-FIX-01: prefer the active-turn durable id when it has content so seed
  // never owns latest during a live/complete turn. Empty previews never win.
  // Fall back to live streamedText when the turn id is known but the FlatList
  // row is still empty (Zero lag / empty placeholder).
  const latestAgent = (() => {
    if (preferredLatestAgentId) {
      const preferred = messages.find((m) => m.id === preferredLatestAgentId);
      if (preferred && preferred.content.trim().length > 0) {
        return preferred;
      }
      if (streamedText.trim().length > 0 && streamPhase !== 'idle' && streamPhase !== 'degraded') {
        return {
          id: preferredLatestAgentId,
          role: 'agent' as const,
          content: streamedText,
          createdAt: new Date(),
        };
      }
      // While a turn is still owned by the stream controller, do NOT fall back
      // to seed (would stub success testID onto historical text).
      if (streamPhase !== 'idle' && streamPhase !== 'degraded') {
        return null;
      }
    }
    return selectLatestAgentMessage(messages);
  })();
  const latestAgentId = latestAgent?.id ?? null;

  // Auto-scroll to visual bottom (offset 0) when new messages/stream grow.
  useEffect(() => {
    if (streamTokenCount < 0) return;
    if (listData.length > 0 || effectiveShowTypingIndicator || isStreamLive) {
      flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
    }
  }, [
    listData.length,
    effectiveShowTypingIndicator,
    isStreamLive,
    streamTokenCount,
    latestAgent?.content,
    streamPhase,
  ]);

  // Reset module peak oracles when a new stream turn starts so stale peaks from
  // prior Maestro runs cannot greenwash token-count-at-least-N without tokens.
  const prevStreamPhaseRef = useRef(streamPhase);
  useEffect(() => {
    const prev = prevStreamPhaseRef.current;
    prevStreamPhaseRef.current = streamPhase;
    if (prev !== 'streaming' && streamPhase === 'streaming' && streamTokenCount === 0) {
      modulePeakLastSeq = 0;
      modulePeakTokenCount = 0;
      setPeakTick((n) => n + 1);
    }
  }, [streamPhase, streamTokenCount]);

  // REDHAT-FIX-11 PATH-A: rendered latest-agent text vs durable Zero content.
  // Mounts chat-content-byte-equal only when both sides agree after durable land;
  // deliberate divergence mounts chat-content-byte-mismatch (Maestro fails).
  const durableLatestContent = durableContentForMessageId(durableMessages, latestAgentId);
  const contentByteEqualOracleId = resolveChatContentByteEqualOracleId(
    latestAgent?.content ?? null,
    durableLatestContent
  );

  const resolveAgentRowTestId = (item: ChatMessage): string => {
    // De-fake Maestro oracles: seed/historical agent rows MUST NOT share the
    // success selector used for the live turn (AC-1 / AC-5 dual-lens).
    // - streaming: in-progress SSE bubble for the active run
    // - latest: most recent agent bubble after complete/cancel (new turn)
    // - seed/historical: durable id suffix only (never matches success path)
    if (item.id === streamingMessageId) {
      return 'chat-assistant-message-streaming';
    }
    if (item.id === latestAgentId) {
      return 'chat-assistant-message-latest';
    }
    return `chat-assistant-message-${item.id}`;
  };

  // REDHAT-FIX-03 AC-3: count distinct agent rows that own the live-turn
  // selectors (streaming and/or latest). After complete, streaming id is null
  // so count must be 1 — Maestro asserts chat-assistant-bubble-count-1.
  const turnAgentBubbleCount = (() => {
    const ids = new Set<string>();
    for (const m of messages) {
      if (m.role !== 'agent') continue;
      if (m.id === streamingMessageId || m.id === latestAgentId) {
        ids.add(m.id);
      }
    }
    return ids.size;
  })();

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    // Maestro PRIMARY oracles resolve on the pressable wrapper (more reliable
    // than nested Text for XCTest).
    const rowTestId = item.role === 'agent' ? resolveAgentRowTestId(item) : `message-${item.id}`;
    const isStreamingRow = item.id === streamingMessageId;
    // GATE-FIX-01 product: include message body in accessibilityLabel so Maestro
    // assertVisible can match multi-word substrings (Markdown splits text nodes).
    const contentLabel =
      typeof item.content === 'string' && item.content.trim().length > 0
        ? item.content.replace(/\s+/g, ' ').trim().slice(0, 240)
        : '';
    return (
      <Pressable
        testID={rowTestId}
        onLongPress={() => handleMessageLongPress(item.id, item.content)}
        delayLongPress={400}
        accessible
        accessibilityLabel={
          item.role === 'agent'
            ? isStreamingRow
              ? `Assistant streaming message ${contentLabel}`.trim()
              : `Assistant message ${contentLabel}`.trim()
            : `User message ${contentLabel}`.trim()
        }
      >
        <MessageBubble
          role={item.role}
          content={item.content}
          message_type={item.message_type}
          card_data={item.card_data}
          toolCallId={item.toolCallId}
          voiceSessionId={item.voiceSessionId}
          createdAt={item.createdAt}
          showTimestamp={true}
          testID={rowTestId}
          onCardPress={handleCardPress}
          onFinalResultPress={onFinalResultPress}
          onWhatsNewReportPress={onWhatsNewReportPress}
          onDocumentContextNavigate={onDocumentContextNavigate}
          isStreaming={isStreamingRow}
          onSaveRecommendation={onSaveRecommendation}
          onSaveRecommendationList={onSaveRecommendationList}
          onSendMessage={onSendMessage}
        />
      </Pressable>
    );
  };

  const renderEmptyState = () => {
    // While loading, show nothing (seamless UI) - or a very subtle indicator
    if (isLoading) {
      return (
        <View
          className="flex-1 items-center justify-center p-6"
          style={{ transform: [{ scaleY: -1 }] }}
          testID="chat-loading-inline"
        >
          <ActivityIndicator size="small" className="text-muted-foreground opacity-50" />
        </View>
      );
    }

    // Truly empty - show helpful message
    return (
      <View
        className="flex-1 items-center justify-center p-6"
        style={{ transform: [{ scaleY: -1 }] }}
      >
        <Text variant="large" className="text-muted-foreground text-center">
          No messages yet
        </Text>
        <Text variant="muted" className="text-center mt-2">
          Start a conversation to see messages here
        </Text>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (aaiActive) {
      return (
        <View className="my-1 px-4 items-start">
          <AgentActivityIndicator phase={phase} toolName={toolName} />
        </View>
      );
    }
    if (!effectiveShowTypingIndicator) return null;
    return <TypingIndicator />;
  };

  const renderStreamStatus = () => {
    // ALWAYS mount numeric peak oracles (even when streamPhase === 'idle').
    // resetStream() after durable complete sets phase idle — if oracles lived
    // only inside the non-idle branch, Maestro lost lastSeq/tokenCount after
    // airplane resume (REDHAT-FIX-03 AC-3).
    const degradedText = degradedMessage ?? SURFACE_UNAVAILABLE_MESSAGE;
    return (
      <View
        className="px-4 py-1"
        accessibilityRole="text"
        accessibilityLabel={`Chat stream status ${streamPhase}`}
      >
        {streamPhase === 'degraded' ? (
          <View
            className="self-stretch rounded-lg border border-warning/40 bg-warning/10 px-3 py-2"
            testID="chat-degraded-banner"
            accessibilityRole="alert"
            accessibilityLabel={degradedText}
            accessible
          >
            {/*
              Exact SURFACE_UNAVAILABLE_MESSAGE — no spinner (AC-1 no hang).
              Theme tokens via semantic classNames (warning surface).
            */}
            <Text variant="small" className="text-foreground" testID="chat-degraded-message">
              {degradedText}
            </Text>
          </View>
        ) : null}
        {streamPhase === 'reconnecting' ? (
          <View
            className="flex-row items-center gap-2 self-start rounded-full border border-border bg-muted/40 px-3 py-1"
            testID="chat-reconnecting-indicator"
            accessibilityLabel="Reconnecting to stream"
          >
            <ActivityIndicator size="small" className="text-muted-foreground" />
            <Text variant="muted" className="text-sm text-muted-foreground">
              Reconnecting…
            </Text>
          </View>
        ) : null}
        {/*
          e2e oracles for phase / Last-Event-ID / token count.
          Use accessible Views (not 1px transparent Text) so Maestro/iOS XCTest
          can resolve testIDs while remaining visually unobtrusive.
          Mounted for ALL phases including idle so peak at-least-N survives complete.
        */}
        <View
          testID="chat-stream-phase"
          accessible
          accessibilityLabel={`stream-phase-${streamPhase}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{streamPhase}</Text>
        </View>
        {/* Phase-specific testID so Maestro can assert cancelled/complete without
            reading accessibility text (XCTest id match is more reliable). */}
        <View
          testID={`chat-stream-phase-${streamPhase}`}
          accessible
          accessibilityLabel={`stream-phase-${streamPhase}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{`stream-phase-${streamPhase}`}</Text>
        </View>
        <View
          testID="chat-stream-last-seq"
          accessible
          accessibilityLabel={`stream-last-seq-${oracleLastSeq}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{String(oracleLastSeq)}</Text>
        </View>
        {/*
          REDHAT-FIX-03: numeric lastSeq oracle — Maestro captures value-bearing
          testID (not visibility-only chat-stream-last-seq). Uses high-water peak
          so oracles survive post-complete resetStream().
        */}
        <View
          testID={`chat-stream-last-seq-${oracleLastSeq}`}
          accessible
          accessibilityLabel={`stream-last-seq-${oracleLastSeq}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{`stream-last-seq-${oracleLastSeq}`}</Text>
        </View>
        {oracleLastSeq >= 3 ? (
          <View
            testID="chat-stream-last-seq-at-least-3"
            accessible
            accessibilityLabel="stream-last-seq-at-least-3"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
          >
            <Text>stream-last-seq-at-least-3</Text>
          </View>
        ) : null}
        <View
          testID="chat-stream-token-count"
          accessible
          accessibilityLabel={`stream-token-count-${oracleTokenCount}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{String(oracleTokenCount)}</Text>
        </View>
        {/* Threshold oracles: Maestro waits for these to prove token growth
            (AC-1 must_observe >=1, AC-5 partial cancel after >=3).
            Include Text children — empty Views are not discoverable by XCTest.
            Peak high-water survives resetStream after durable reconcile. */}
        {oracleTokenCount >= 1 ? (
          <View
            testID="chat-stream-token-count-at-least-1"
            accessible
            accessibilityLabel="stream-token-count-at-least-1"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
          >
            <Text>stream-token-count-at-least-1</Text>
          </View>
        ) : null}
        {oracleTokenCount >= 3 ? (
          <View
            testID="chat-stream-token-count-at-least-3"
            accessible
            accessibilityLabel="stream-token-count-at-least-3"
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
          >
            <Text>stream-token-count-at-least-3</Text>
          </View>
        ) : null}
        <View
          testID={`chat-stream-token-count-${oracleTokenCount}`}
          accessible
          accessibilityLabel={`stream-token-count-${oracleTokenCount}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{`stream-token-count-${oracleTokenCount}`}</Text>
        </View>
        {/*
          REDHAT-FIX-03 AC-3: live-turn agent bubble count oracle.
          Value-bearing testID so Maestro asserts count == 1 (not visibility-only).
        */}
        <View
          testID={`chat-assistant-bubble-count-${turnAgentBubbleCount}`}
          accessible
          accessibilityLabel={`chat-assistant-bubble-count-${turnAgentBubbleCount}`}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
        >
          <Text>{`chat-assistant-bubble-count-${turnAgentBubbleCount}`}</Text>
        </View>
        {/*
          REDHAT-FIX-11 PATH-A: content byte-equal oracle.
          Compares rendered latest agent text to durable Zero/chat_messages.content
          (not SSE UNIQUE_TEXT stub). Hidden View pattern matches last-seq oracles.
        */}
        {contentByteEqualOracleId ? (
          <View
            testID={contentByteEqualOracleId}
            accessible
            accessibilityLabel={contentByteEqualOracleId}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
          >
            <Text>{contentByteEqualOracleId}</Text>
          </View>
        ) : null}
        {/*
          GATE-FIX-01 fail-safe (product-tightened): only mount the 1×1 latest
          oracle when the SAME non-empty content is painted on a real FlatList
          MessageBubble. Never greenwash Maestro from streamedText alone when
          the thread still shows only seed / empty bubbles after airplane restore.
        */}
        {(() => {
          const paintedLatest =
            latestAgentId != null &&
            latestAgent != null &&
            latestAgent.content.trim().length > 0 &&
            messages.some(
              (m) =>
                m.id === latestAgentId &&
                typeof m.content === 'string' &&
                m.content.trim().length > 0 &&
                // Content must match (or be a prefix during live stream growth)
                (m.content === latestAgent.content ||
                  latestAgent.content.startsWith(m.content) ||
                  m.content.startsWith(latestAgent.content))
            );
          if (!paintedLatest) return null;
          return (
            <View
              testID="chat-assistant-message-latest"
              accessible
              accessibilityLabel="Assistant message"
              style={{ position: 'absolute', width: 1, height: 1, opacity: 0.01 }}
            >
              <Text>{latestAgent!.content.slice(0, 200)}</Text>
            </View>
          );
        })()}
      </View>
    );
  };

  return (
    <View className="flex-1" testID={testID}>
      <FlatList
        ref={flatListRef}
        data={listData}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        inverted={true}
        extraData={`${latestAgentId}:${latestAgent?.content?.length ?? 0}:${streamPhase}:${streamTokenCount}`}
        ListEmptyComponent={renderEmptyState}
        ListHeaderComponent={
          <>
            {renderStreamStatus()}
            {renderTypingIndicator()}
          </>
        }
        contentContainerStyle={
          listData.length === 0
            ? { flex: 1, justifyContent: 'center', paddingBottom: safeAreaTop }
            : { paddingBottom: safeAreaTop }
        }
      />

      {/* Message actions bottom sheet */}
      <MessageActionsSheet
        visible={actionSheetVisible}
        onClose={handleSheetClose}
        onDeletePress={handleDeleteFromSheet}
        messageContent={selectedMessageContent}
      />
    </View>
  );
}
