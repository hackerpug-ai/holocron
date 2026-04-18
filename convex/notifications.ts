/**
 * Central registration file for notifications functions
 * This file ensures all notifications functions are deployed by importing them
 */

// Import all notifications mutations to ensure deployment
export {
  markAllRead,
  markNavTooltipSeen,
  markRead,
  updateLastSeen,
} from './notifications/mutations';
// Import all notifications queries to ensure deployment
export {
  getHasSeenNavTooltip,
  getLastSeen,
  hasNewSince,
  listRecent,
  listUnread,
} from './notifications/queries';
