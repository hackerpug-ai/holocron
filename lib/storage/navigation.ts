import AsyncStorage from '@react-native-async-storage/async-storage'

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const STORAGE_KEY_PREFIX = 'navigation:'

/**
 * Storage key for the What's New tooltip seen flag
 */
const WHATS_NEW_TOOLTIP_SEEN = `${STORAGE_KEY_PREFIX}whats_new_tooltip_seen`

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if the What's New tooltip has been seen.
 * Returns true if the user has already dismissed the tooltip.
 */
export async function getWhatsNewTooltipSeen(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(WHATS_NEW_TOOLTIP_SEEN)
    return value === 'true'
  } catch {
    // Non-critical - assume not seen on error
    return false
  }
}

/**
 * Mark the What's New tooltip as seen.
 * Called when the user dismisses the tooltip.
 */
export async function setWhatsNewTooltipSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(WHATS_NEW_TOOLTIP_SEEN, 'true')
  } catch {
    // Non-critical - silently ignore storage errors
  }
}

/**
 * Reset the What's New tooltip seen flag.
 * Used for testing or when clearing app data.
 */
export async function resetWhatsNewTooltipSeen(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WHATS_NEW_TOOLTIP_SEEN)
  } catch {
    // Non-critical
  }
}
