/**
 * Flights Validators
 *
 * Shared v validators for flights table fields.
 * Used across mutations and queries.
 */

import { v } from "convex/values";

/**
 * Status values for a flights session
 */
export const flightsSessionStatus = v.union(
  v.literal("pending"),
  v.literal("searching"),
  v.literal("completed"),
  v.literal("failed")
);

/**
 * Season values for a flights session
 */
export const flightsSeason = v.union(
  v.literal("shoulder"),
  v.literal("peak"),
  v.literal("off-peak")
);

/**
 * Validator for creating a new flights session
 */
export const createSessionArgs = v.object({
  origin: v.string(),
  destination: v.string(),
  dateRange: v.optional(v.string()),
});

/**
 * Validator for updating a flights session
 */
export const updateSessionArgs = v.object({
  sessionId: v.id("flightsSessions"),
  status: v.optional(v.string()),
  bestDealPrice: v.optional(v.number()),
  bestDealAirline: v.optional(v.string()),
  bestDealDates: v.optional(v.string()),
  season: v.optional(v.string()),
  cheapestDay: v.optional(v.string()),
  shoulderSeason: v.optional(v.string()),
  bookBy: v.optional(v.string()),
  documentId: v.optional(v.id("documents")),
  errorReason: v.optional(v.string()),
});

/**
 * Validator for adding a flight route
 */
export const addRouteArgs = v.object({
  sessionId: v.id("flightsSessions"),
  airline: v.string(),
  departDate: v.string(),
  returnDate: v.optional(v.string()),
  price: v.number(),
  stops: v.number(),
  duration: v.optional(v.string()),
  isBestDeal: v.boolean(),
  bookingUrl: v.optional(v.string()),
});

/**
 * Validator for adding a price calendar entry
 */
export const addPriceCalendarEntryArgs = v.object({
  sessionId: v.id("flightsSessions"),
  date: v.string(),
  dayOfWeek: v.string(),
  weekNumber: v.number(),
  price: v.number(),
  isCheapest: v.boolean(),
});
