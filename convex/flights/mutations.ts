/**
 * Flights Mutations
 *
 * CRUD operations for flight sessions, routes, and price calendar entries.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";

// ============================================================================
// Session Mutations
// ============================================================================

/**
 * Create a new flights session with status "pending"
 */
export const createSession = mutation({
  args: {
    origin: v.string(),
    destination: v.string(),
    dateRange: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"flightsSessions">> => {
    const now = Date.now();
    const sessionId = await ctx.db.insert("flightsSessions", {
      origin: args.origin,
      destination: args.destination,
      dateRange: args.dateRange,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    return sessionId;
  },
});

/**
 * Update a flights session's fields (best deal, tips, status, etc.)
 */
export const updateSession = mutation({
  args: {
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
  },
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...updates } = args;

    const filteredUpdates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }

    await ctx.db.patch(sessionId, filteredUpdates);
  },
});

/**
 * Mark a flights session as completed
 */
export const completeSession = mutation({
  args: {
    sessionId: v.id("flightsSessions"),
    bestDealPrice: v.optional(v.number()),
    bestDealAirline: v.optional(v.string()),
    bestDealDates: v.optional(v.string()),
    season: v.optional(v.string()),
    cheapestDay: v.optional(v.string()),
    shoulderSeason: v.optional(v.string()),
    bookBy: v.optional(v.string()),
    documentId: v.optional(v.id("documents")),
  },
  handler: async (ctx, args): Promise<void> => {
    const { sessionId, ...fields } = args;
    const now = Date.now();

    const updates: Record<string, unknown> = {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        updates[key] = value;
      }
    }

    await ctx.db.patch(sessionId, updates);
  },
});

/**
 * Mark a flights session as failed with an error reason
 */
export const failSession = mutation({
  args: {
    sessionId: v.id("flightsSessions"),
    errorReason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const now = Date.now();
    await ctx.db.patch(args.sessionId, {
      status: "failed",
      errorReason: args.errorReason,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Route Mutations
// ============================================================================

/**
 * Add a flight route option to a session
 */
export const addRoute = mutation({
  args: {
    sessionId: v.id("flightsSessions"),
    airline: v.string(),
    departDate: v.string(),
    returnDate: v.optional(v.string()),
    price: v.number(),
    stops: v.number(),
    duration: v.optional(v.string()),
    isBestDeal: v.boolean(),
    bookingUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"flightsRoutes">> => {
    const now = Date.now();
    const { sessionId, ...routeData } = args;

    const routeId = await ctx.db.insert("flightsRoutes", {
      sessionId,
      ...routeData,
      createdAt: now,
    });
    return routeId;
  },
});

// ============================================================================
// Price Calendar Mutations
// ============================================================================

/**
 * Add a price calendar entry (daily price) to a session
 */
export const addPriceCalendarEntry = mutation({
  args: {
    sessionId: v.id("flightsSessions"),
    date: v.string(),
    dayOfWeek: v.string(),
    weekNumber: v.number(),
    price: v.number(),
    isCheapest: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"flightsPriceCalendar">> => {
    const now = Date.now();
    const { sessionId, ...entryData } = args;

    const entryId = await ctx.db.insert("flightsPriceCalendar", {
      sessionId,
      ...entryData,
      createdAt: now,
    });
    return entryId;
  },
});
