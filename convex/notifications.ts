/**
 * Central registration file for notifications functions
 * This file ensures all notifications functions are deployed by importing them
 */

// Import all notifications queries to ensure deployment
export {
  listUnread,
  listRecent,
  hasNewSince,
  getLastSeen,
  getHasSeenNavTooltip,
} from "./notifications/queries";

// Import all notifications mutations to ensure deployment
export {
  markRead,
  markAllRead,
  updateLastSeen,
  markNavTooltipSeen,
} from "./notifications/mutations";
