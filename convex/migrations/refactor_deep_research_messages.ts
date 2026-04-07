/**
 * Migration: Refactor Deep Research Messages
 *
 * Changes card_type (UI logic) to status (domain state) for deep research messages.
 *
 * Before:
 * - messageType: "result_card"
 * - cardData.card_type: "deep_research_loading" | "deep_research_final"
 *
 * After:
 * - messageType: "deep_research"
 * - cardData.status: "in_progress" | "completed"
 *
 * Run this with: npx convex run migrations/refactor_deep_research_messages:migrate
 */

import { internalMutation } from "../_generated/server";

export const migrate = internalMutation({
  args: {},
  handler: async (ctx) => {

    // Query all messages
    const messages = await ctx.db.query("chatMessages").collect();

    let migratedCount = 0;
    let skippedCount = 0;

    for (const message of messages) {
      // Only migrate deep research messages
      if (
        message.messageType !== "result_card" ||
        !message.cardData?.card_type
      ) {
        skippedCount++;
        continue;
      }

      const cardType = message.cardData.card_type as string;

      // Only migrate deep research card types
      if (
        cardType !== "deep_research_loading" &&
        cardType !== "deep_research_final"
      ) {
        skippedCount++;
        continue;
      }

      // Map card_type to status (domain state)
      const status =
        cardType === "deep_research_loading" ? "in_progress" : "completed";

      // Create new cardData without card_type
      const { card_type, ...restCardData } = message.cardData;

      // Update the message (keep as result_card, just update cardData)
      await ctx.db.patch(message._id, {
        cardData: {
          ...restCardData,
          status,
        },
      });

      migratedCount++;
      
    }

    

    return {
      success: true,
      migratedCount,
      skippedCount,
    };
  },
});
