import { Pressable, View } from 'react-native'
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from '@/components/ui/text'
import { Pause, Play, RefreshCw, SkipBack, SkipForward } from '@/components/ui/icons'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/use-theme'
import { SpinnerRing } from './SpinnerRing'
import type { PlaybackSpeed, UseNarrationStateReturn } from './hooks/useNarrationState'

// ─── Constants ────────────────────────────────────────────────────────────────

export const NARRATION_BAR_HEIGHT = 88

const SPEED_CYCLE: PlaybackSpeed[] = [0.5, 1, 1.5, 2]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function nextSpeed(current: PlaybackSpeed): PlaybackSpeed {
  const idx = SPEED_CYCLE.indexOf(current)
  return SPEED_CYCLE[(idx + 1) % SPEED_CYCLE.length]
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface NarrationControlBarProps {
  narration: UseNarrationStateReturn
  isVisible: boolean
  /** True when the current segment is not yet available and we're waiting for it */
  isSegmentLoading?: boolean
  testID?: string
  onRegenerate?: () => void
  audioJob?: {
    _id: string
    status: string
    totalSegments: number
    completedSegments: number
    failedSegments: number
    errorMessage?: string
  } | null
  onRetryFailed?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * NarrationControlBar is a fixed bottom bar that slides up when visible.
 *
 * Layout:
 * - Full-width 2px progress stripe flush at top
 * - Controls row: elapsed time | skip-prev | play/pause | skip-next | total time
 * - Sub-row: paragraph counter | speed pill + regenerate button
 *
 * The bar animates with withSpring when isVisible changes.
 */
export function NarrationControlBar({
  narration,
  isVisible,
  isSegmentLoading = false,
  testID = 'narration-control-bar',
  onRegenerate,
  audioJob,
  onRetryFailed,
}: NarrationControlBarProps) {
  const insets = useSafeAreaInsets()
  const { colors: themeColors } = useTheme()
  const { state } = narration

  const {
    status,
    activeParagraphIndex,
    totalParagraphs,
    currentTimeSeconds,
    totalTimeSeconds,
    playbackSpeed,
  } = state

  const isPlaying = status === 'playing'
  const isPaused = status === 'paused'

  // Spinner ring only when user has pressed play and we're waiting for audio
  const showSpinnerRing = (isPlaying || isPaused) && isSegmentLoading

  const canSkipPrev = activeParagraphIndex > 0
  const canSkipNext = activeParagraphIndex < totalParagraphs - 1

  const progressFraction =
    totalTimeSeconds > 0 ? Math.min(currentTimeSeconds / totalTimeSeconds, 1) : 0

  // ── Animation ──────────────────────────────────────────────────────────────

  const animatedStyle = useAnimatedStyle(() => {
    const hiddenOffset = NARRATION_BAR_HEIGHT + insets.bottom
    return {
      transform: [
        {
          translateY: withSpring(isVisible ? 0 : hiddenOffset, {
            damping: 22,
            stiffness: 320,
          }),
        },
      ],
    }
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSpeedPress = () => {
    narration.setSpeed(nextSpeed(playbackSpeed))
  }

  // ── Display paragraph index (1-based, min 1 when active) ──────────────────
  const displayParagraph = activeParagraphIndex >= 0 ? activeParagraphIndex + 1 : 1

  return (
    <Animated.View
      testID={testID}
      style={[animatedStyle, { paddingBottom: insets.bottom }]}
      className="absolute bottom-0 left-0 right-0 border-t border-border bg-card"
    >
      {/* Progress stripe */}
      <View className="h-0.5 w-full bg-muted overflow-hidden">
        <View
          className={cn(
            'h-full',
            audioJob?.status === 'running' ? 'bg-warning' : 'bg-primary'
          )}
          style={{ width: `${progressFraction * 100}%` }}
        />
      </View>

      {/* Controls area */}
      <View className="px-4 pt-2 pb-1">
        {/* Controls row */}
        <View className="flex-row items-center justify-center gap-4">
          {/* Elapsed time */}
          <Text
            className="text-muted-foreground text-xs tabular-nums"
            style={{ width: 44, textAlign: 'left' }}
          >
            {formatTime(currentTimeSeconds)}
          </Text>

          {/* Skip previous */}
          <Pressable
            testID="narration-skip-previous"
            onPress={narration.skipPrevious}
            disabled={!canSkipPrev}
            accessibilityRole="button"
            accessibilityLabel="Skip to previous paragraph"
            className={cn(!canSkipPrev && 'opacity-40')}
          >
            <SkipBack size={22} className="text-foreground" />
          </Pressable>

          {/* Play / Pause */}
          <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center' }}>
            <SpinnerRing
              size={56}
              strokeWidth={2.5}
              active={showSpinnerRing}
              color={themeColors.primary}
            />
            <Pressable
              testID="narration-play-pause"
              onPress={narration.togglePlayPause}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause narration' : 'Play narration'}
              className="h-[52px] w-[52px] items-center justify-center rounded-full bg-primary"
            >
              {isPlaying ? (
                <Pause size={24} className="text-primary-foreground" />
              ) : (
                <Play size={24} className="text-primary-foreground" />
              )}
            </Pressable>
          </View>

          {/* Skip next */}
          <Pressable
            testID="narration-skip-next"
            onPress={narration.skipNext}
            disabled={!canSkipNext}
            accessibilityRole="button"
            accessibilityLabel="Skip to next paragraph"
            className={cn(!canSkipNext && 'opacity-40')}
          >
            <SkipForward size={22} className="text-foreground" />
          </Pressable>

          {/* Total time */}
          <Text
            className="text-muted-foreground text-xs tabular-nums"
            style={{ width: 44, textAlign: 'right' }}
          >
            {formatTime(totalTimeSeconds)}
          </Text>
        </View>

        {/* Sub-row */}
        <View className="mt-1 flex-row items-center justify-between">
          {/* Paragraph counter + generation progress */}
          <View className="flex-row items-center gap-2">
            <Text className="text-muted-foreground text-xs">
              Para {displayParagraph} of {totalParagraphs}
            </Text>
            {audioJob?.status === 'running' && audioJob.totalSegments > 0 && (
              <Text className="text-muted-foreground text-xs">
                {audioJob.completedSegments}/{audioJob.totalSegments} ready
              </Text>
            )}
          </View>

          {/* Right controls */}
          <View className="flex-row items-center gap-5">
            {/* Speed pill */}
            <Pressable
              testID="narration-speed-control"
              onPress={handleSpeedPress}
              accessibilityRole="button"
              accessibilityLabel={`Playback speed ${playbackSpeed}x, tap to change`}
              className="rounded-full bg-muted px-2 py-0.5"
            >
              <Text className="text-muted-foreground text-xs">
                {playbackSpeed === 1 || playbackSpeed === 2
                  ? `${playbackSpeed}x`
                  : `${playbackSpeed}x`}
              </Text>
            </Pressable>

            {/* Regenerate */}
            <Pressable
              testID="narration-regenerate"
              onPress={() => {
                narration.regenerate()
                onRegenerate?.()
              }}
              accessibilityRole="button"
              accessibilityLabel="Regenerate narration"
            >
              <RefreshCw size={16} className="text-muted-foreground" />
            </Pressable>
          </View>
        </View>

        {/* Error row — shown whenever segments have failed */}
        {audioJob != null && audioJob.failedSegments > 0 && (
          <View className="mt-1 flex-row items-center gap-2" testID="narration-error-row">
            <Text className="text-destructive text-xs flex-1">
              {audioJob.failedSegments} segment{audioJob.failedSegments > 1 ? 's' : ''} failed
            </Text>
            <Pressable
              testID="narration-retry-failed"
              onPress={onRetryFailed}
              accessibilityRole="button"
              accessibilityLabel="Retry failed segments"
              className="rounded bg-muted px-2 py-0.5"
            >
              <Text className="text-foreground text-xs">Retry</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Animated.View>
  )
}
