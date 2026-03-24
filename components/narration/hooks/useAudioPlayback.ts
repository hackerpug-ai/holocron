import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'
import type { AudioPlayer, AudioEvents } from 'expo-audio'
import type { AudioStatus } from 'expo-audio'
import { useEffect, useRef, useState } from 'react'
import { UseNarrationStateReturn } from './useNarrationState'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AudioSegment {
  _id: string
  paragraphIndex: number
  status: string
  audioUrl: string | null
  durationMs?: number
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
 * Stale closure safety: narration callbacks and state values that are read
 * inside async callbacks or status listeners are accessed via refs so
 * the listeners always see the latest values without being re-registered.
 *
 * @param segments - Convex audio segment records for the current article
 * @param narration - The UseNarrationStateReturn from useNarrationState
 */
export function useAudioPlayback(
  segments: AudioSegment[],
  narration: UseNarrationStateReturn
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
    })

    return () => {
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

    // Segment not yet generated or URL not available — don't load anything but
    // don't bail out silently. Show a loading state; the reactive Convex
    // subscription will re-trigger this effect when the segment completes.
    if (!segment?.audioUrl) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narration.state.status, narration.state.activeParagraphIndex, segments])

  // ─── Apply speed changes to the currently loaded player ───────────────────

  useEffect(() => {
    const player = playerRef.current
    if (!player) return

    player.setPlaybackRate(narration.state.playbackSpeed)
  }, [narration.state.playbackSpeed])

  // ─── Release player on EXIT_MODE (idle) and REGENERATE (generating) ───────

  useEffect(() => {
    const { status } = narration.state
    if (status === 'idle' || status === 'generating') {
      releasePlayer(playerRef.current)
      playerRef.current = null
      loadedIndexRef.current = -1
    }
  }, [narration.state.status])

  return { isLoading }
}
