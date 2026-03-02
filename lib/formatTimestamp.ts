import { format, isToday, isYesterday } from 'date-fns'

/**
 * Format a timestamp as a relative time string
 * - < 1 min: "just now"
 * - < 60 min: "Xm ago"
 * - < 24 hours: "Xh ago"
 * - Yesterday: "Yesterday 3:45 PM"
 * - < 7 days: "Wed 3:45 PM"
 * - Older: "Mar 15 3:45 PM"
 */
export function formatRelativeTimestamp(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return `Yesterday ${formatTime(date)}`
  if (diffDays < 7) return `${getDayName(date)} ${formatTime(date)}`
  return `${formatDate(date)} ${formatTime(date)}`
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDate(date: Date): string {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function getDayName(date: Date): string {
  return date.toLocaleDateString([], { weekday: 'short' })
}

/**
 * Format timestamp for display (legacy implementation for backward compatibility)
 * - "just now" for < 1 minute
 * - "X min ago" for < 1 hour
 * - "h:mm a" for today
 * - "Yesterday, h:mm a" for yesterday
 * - "MMM d, h:mm a" for older
 */
export function formatTimestamp(date: Date): string {
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000)

  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes} min ago`
  if (isToday(date)) return format(date, 'h:mm a')
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`
  return format(date, 'MMM d, h:mm a')
}
