import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import type { AudioPlayer } from 'expo-audio'
import type { AudioStatus } from 'expo-audio'
import { useEffect, useRef, useState } from 'react'
import { UseNarrationStateReturn } from './useNarrationState'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioSegment {
  _id: string | { toString(): string }
  paragraphIndex: number
  status: string
  audioUrl: string | null
  durationMs?: number | null
  jobId?: unknown
}

export interface AudioPlaybackMetadata {
  title?: string
  artist?: string
}

export interface UseAudioPlaybackReturn {
  isLoading: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function releasePlayer(player: AudioPlayer | null): void {
  if (!player) return
  try {
    player.pause()
    player.remove()
  } catch {
    // Player may already be released — safe to ignore
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * useAudioPlayback bridges Convex audio segments with the narration state
 * machine. It owns the expo-audio AudioPlayer lifecycle: loading, playback,
 * rate changes, auto-advance on segment completion, and cleanup.
 *
 * Supports background playback, lock screen controls, and CarPlay via
 * expo-audio's setActiveForLockScreen API.
 *
 * @param segments - Convex audio segment records for the current article
 * @param narration - The UseNarrationStateReturn from useNarrationState
 * @param metadata - Optional metadata for lock screen / CarPlay display
 */
export function useAudioPlayback(
  segments: AudioSegment[],
  narration: UseNarrationStateReturn,
  metadata?: AudioPlaybackMetadata
): UseAudioPlaybackReturn {
  // ─── Stable refs for values read inside async/callback contexts ──────────

  const narrationRef = useRef(narration)
  useEffect(() => {
    narrationRef.current = narration
  })

  const segmentsRef = useRef(segments)
  useEffect(() => {
    segmentsRef.current = segments
  })

  // ─── Player instance state ──────────────────────────────────────────────

  const playerRef = useRef<AudioPlayer | null>(null)
  const loadedIndexRef = useRef<number>(-1)

  const [isLoading, setIsLoading] = useState(false)

  // ─── Configure audio session on mount ─────────────────────────────────

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    })

    return () => {
      // Clear lock screen controls on cleanup
      const player = playerRef.current
      if (player) {
        try {
          player.clearLockScreenControls()
        } catch {
          // Safe to ignore
        }
      }
      releasePlayer(playerRef.current)
      playerRef.current = null
      loadedIndexRef.current = -1
    }
  }, [])

  // ─── Load and play segment when active paragraph or play state changes ─────

  useEffect(() => {
    const { status, activeParagraphIndex, playbackSpeed } = narration.state

    // Only manage playback when the state machine is in an active state
    if (status !== 'playing' && status !== 'paused') {
      return
    }

    if (activeParagraphIndex < 0) {
      return
    }

    const segment = segments.find(s => s.paragraphIndex === activeParagraphIndex)

    // Segment not yet generated or URL not available — stop any currently
    // playing audio so the old segment doesn't keep playing while the
    // highlight has moved. The reactive Convex subscription will re-trigger
    // this effect when the segment completes.
    if (!segment?.audioUrl) {
      // Stop and release the old player so stale audio doesn't continue
      if (loadedIndexRef.current !== activeParagraphIndex && playerRef.current) {
        releasePlayer(playerRef.current)
        playerRef.current = null
        loadedIndexRef.current = -1
      }
      setIsLoading(true)
      return
    }

    const audioUrl = segment.audioUrl

    // Same segment already loaded: just play or pause without reloading
    if (loadedIndexRef.current === activeParagraphIndex && playerRef.current) {
      if (status === 'playing') {
        playerRef.current.play()
      } else {
        playerRef.current.pause()
      }
      return
    }

    // New segment requested: release previous, then create the new player
    let cancelled = false
    const targetIndex = activeParagraphIndex

    function loadAndPlay() {
      setIsLoading(true)

      const previous = playerRef.current
      playerRef.current = null
      loadedIndexRef.current = -1
      releasePlayer(previous)

      if (cancelled) return

      try {
        const player = createAudioPlayer(audioUrl)

        if (cancelled) {
          releasePlayer(player)
          return
        }

        player.shouldCorrectPitch = true
        player.setPlaybackRate(playbackSpeed)

        playerRef.current = player
        loadedIndexRef.current = activeParagraphIndex

        // Enable lock screen controls with metadata for background playback
        // and CarPlay. iOS auto-surfaces these in Control Center and CarPlay.
        const sectionLabel = `Section ${activeParagraphIndex + 1}`
        player.setActiveForLockScreen(true, {
          title: metadata?.title ?? 'Narration',
          artist: sectionLabel,
        })

        // Register playback status listener. Uses narrationRef so it always
        // sees the latest handlers and state without re-registering.
        player.addListener('playbackStatusUpdate', (playbackStatus: AudioStatus) => {
          if (!playbackStatus.isLoaded) return

          // Forward position ticks to the state machine for the progress bar
          if (playbackStatus.playing && playbackStatus.currentTime !== undefined) {
            narrationRef.current.onTick(playbackStatus.currentTime)
          }

          // Auto-advance when a segment finishes playing
          if (playbackStatus.didJustFinish) {
            // Guard: only auto-advance if still on the segment this listener was created for
            if (narrationRef.current.state.activeParagraphIndex !== targetIndex) return

            const { activeParagraphIndex: currentIndex, totalParagraphs } =
              narrationRef.current.state

            const isLastSegment = currentIndex >= totalParagraphs - 1

            if (isLastSegment) {
              narrationRef.current.togglePlayPause()
            } else {
              narrationRef.current.skipNext()
            }
          }
        })

        // Start playback once loaded if status is playing
        if (status === 'playing') {
          player.play()
        }
      } catch {
        // Audio load failure is non-fatal; the UI reflects the current state
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadAndPlay()

    return () => {
      cancelled = true
    }
  }, [narration.state.status, narration.state.activeParagraphIndex, segments])

  // ─── Apply speed changes to the currently loaded player ───────────────────

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    player.setPlaybackRate(narration.state.playbackSpeed)
  }, [narration.state.playbackSpeed])

  // ─── Release player and clear lock screen on EXIT_MODE / REGENERATE ───────

  useEffect(() => {
    const { status } = narration.state
    if (status === 'idle' || status === 'generating') {
      const player = playerRef.current
      if (player) {
        try {
          player.clearLockScreenControls()
        } catch {
          // Safe to ignore
        }
      }
      releasePlayer(playerRef.current)
      playerRef.current = null
      loadedIndexRef.current = -1
    }
  }, [narration.state.status])

  return { isLoading }
}
