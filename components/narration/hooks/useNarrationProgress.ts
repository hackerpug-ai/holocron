import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PlaybackSpeed } from './useNarrationState'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NarrationProgress {
  activeParagraphIndex: number
  playbackSpeed: PlaybackSpeed
  lastUpdated: number
}

// ─── Storage Key ──────────────────────────────────────────────────────────────

function storageKey(documentId: string): string {
  return `narration-progress:${documentId}`
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Save narration progress for a document.
 * Called when the active paragraph changes or playback pauses.
 */
export async function saveNarrationProgress(
  documentId: string,
  progress: NarrationProgress
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      storageKey(documentId),
      JSON.stringify(progress)
    )
  } catch {
    // Non-critical — silently ignore storage errors
  }
}

/**
 * Load saved narration progress for a document.
 * Returns null if no progress was saved.
 */
export async function loadNarrationProgress(
  documentId: string
): Promise<NarrationProgress | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(documentId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as NarrationProgress
    // Validate shape
    if (
      typeof parsed.activeParagraphIndex !== 'number' ||
      typeof parsed.lastUpdated !== 'number'
    ) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

/**
 * Clear saved narration progress for a document.
 * Called when narration completes (reaches the end).
 */
export async function clearNarrationProgress(
  documentId: string
): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(documentId))
  } catch {
    // Non-critical
  }
}
