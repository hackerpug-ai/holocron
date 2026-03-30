import { useState, useEffect, useRef } from 'react'

type TranscriptEntry = {
  role: 'user' | 'agent'
  content: string
  timestamp: number
}

/**
 * Filters transcripts to only show recent entries, auto-dismissing old ones.
 * Always keeps the most recent entry visible regardless of age.
 */
export function useAutoDismissCaptions(
  transcripts: TranscriptEntry[],
  dismissAfterMs: number = 8000,
): TranscriptEntry[] {
  const [visibleCaptions, setVisibleCaptions] = useState<TranscriptEntry[]>([])
  const transcriptsRef = useRef(transcripts)
  transcriptsRef.current = transcripts

  useEffect(() => {
    function filterCaptions() {
      const now = Date.now()
      const all = transcriptsRef.current
      if (all.length === 0) {
        setVisibleCaptions([])
        return
      }

      const filtered = all.filter((t, i) => {
        // Always keep the most recent entry
        if (i === all.length - 1) return true
        // Keep entries newer than dismissAfterMs
        return now - t.timestamp < dismissAfterMs
      })

      setVisibleCaptions(filtered)
    }

    // Run immediately
    filterCaptions()

    // Re-evaluate every second
    const interval = setInterval(filterCaptions, 1000)
    return () => clearInterval(interval)
  }, [dismissAfterMs])

  // Also update when transcripts change (new entry added)
  useEffect(() => {
    const now = Date.now()
    const all = transcripts
    if (all.length === 0) {
      setVisibleCaptions([])
      return
    }

    const filtered = all.filter((t, i) => {
      if (i === all.length - 1) return true
      return now - t.timestamp < dismissAfterMs
    })

    setVisibleCaptions(filtered)
  }, [transcripts, dismissAfterMs])

  return visibleCaptions
}
