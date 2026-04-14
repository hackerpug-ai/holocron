"use node";

/**
 * Toolbelt actions
 *
 * Async actions that fetch URL metadata, classify tools via LLM,
 * and save them to the toolbelt.
 */

import { action } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { generateText } from "ai";
import { claudeFlash } from "../lib/ai/anthropic_provider";

type ToolCategory =
  | "libraries"
  | "cli"
  | "framework"
  | "service"
  | "database"
  | "tool";

type ToolSourceType =
  | "github"
  | "npm"
  | "pypi"
  | "website"
  | "cargo"
  | "go"
  | "other";

const VALID_CATEGORIES: ToolCategory[] = [
  "libraries",
  "cli",
  "framework",
  "service",
  "database",
  "tool",
];

/**
 * Infer source type from URL host
 */
function inferSourceType(url: string): ToolSourceType {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("github.com")) return "github";
    if (host.includes("npmjs.com") || host.includes("npmjs.org"))
      return "npm";
    if (host.includes("pypi.org") || host.includes("pypi.python.org"))
      return "pypi";
    if (host.includes("crates.io")) return "cargo";
    if (host.includes("pkg.go.dev") || host.includes("golang.org"))
      return "go";
    return "website";
  } catch {
    return "other";
  }
}

/**
 * Extract title and description from HTML meta tags
 */
function extractHtmlMetadata(html: string): {
  title: string;
  description: string;
} {
  const pick = (regex: RegExp): string => {
    const m = html.match(regex);
    return m ? m[1].trim() : "";
  };

  // Prefer og: tags, fall back to standard tags
  const title =
    pick(
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i
    ) ||
    pick(
      /<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i
    ) ||
    pick(/<title[^>]*>([^<]+)<\/title>/i);

  const description =
    pick(
      /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i
    ) ||
    pick(
      /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i
    ) ||
    pick(
      /<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i
    );

  return {
    title: decodeHtmlEntities(title),
    description: decodeHtmlEntities(description),
  };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

/**
 * Classify tool metadata using LLM
 * Returns category, tags, useCases, and language inferred from title + description.
 */
async function classifyTool(
  title: string,
  description: string,
  sourceType: ToolSourceType,
  url: string
): Promise<{
  category: ToolCategory;
  tags: string;
  useCases: string;
  language: string;
}> {
  const prompt = `You are classifying a developer tool for a knowledge base.

URL: ${url}
Source type: ${sourceType}
Title: ${title}
Description: ${description}

Return ONLY a JSON object (no markdown, no explanation) with these fields:
{
  "category": "libraries" | "cli" | "framework" | "service" | "database" | "tool",
  "tags": "comma,separated,tags",
  "useCases": "comma,separated,use cases",
  "language": "primary programming language (e.g. TypeScript, Python, Rust, Go) or empty string"
}

Guidelines:
- "libraries": importable packages (npm, PyPI, crates)
- "cli": command-line tools
- "framework": app frameworks (React, Django, Rails)
- "service": hosted services / APIs / SaaS
- "database": databases and data stores
- "tool": IDEs, dev tools, utilities, everything else
- tags: 3-6 short lowercase tags
- useCases: 1-3 concrete use cases
- language: if multi-language or unclear, leave empty`;

  try {
    const result = await generateText({
      model: claudeFlash(),
      prompt,
    });

    // Strip any code fences
    const text = result.text.replace(/```json\s*|```\s*/g, "").trim();
    const parsed = JSON.parse(text);

    const category: ToolCategory = VALID_CATEGORIES.includes(
      parsed.category
    )
      ? (parsed.category as ToolCategory)
      : "tool";

    return {
      category,
      tags: typeof parsed.tags === "string" ? parsed.tags : "",
      useCases: typeof parsed.useCases === "string" ? parsed.useCases : "",
      language: typeof parsed.language === "string" ? parsed.language : "",
    };
  } catch (error) {
    console.error("[toolbelt.actions.classifyTool] LLM failed:", error);
    // Safe fallback if LLM/JSON fails
    return {
      category: "tool",
      tags: "",
      useCases: "",
      language: "",
    };
  }
}

/**
 * Add a tool from URL (async).
 *
 * Fetches the URL, extracts metadata via HTML meta tags + LLM classification,
 * and saves it to the toolbelt. If a loadingMessageId is provided, updates
 * that chat message in place with a tool_added (or error) card when finished.
 */
export const addFromUrl = action({
  args: {
    url: v.string(),
    conversationId: v.optional(v.id("conversations")),
    loadingMessageId: v.optional(v.id("chatMessages")),
  },
  handler: async (
    ctx,
    { url, conversationId, loadingMessageId }
  ): Promise<void> => {
    const postError = async (message: string): Promise<void> => {
      // Prefer updating the loading message in place so the spinner goes away.
      if (loadingMessageId) {
        await ctx.runMutation(api.chatMessages.mutations.update, {
          id: loadingMessageId,
          content: message,
          messageType: "error" as const,
          cardData: undefined,
        });
        return;
      }
      if (!conversationId) return;
      await ctx.runMutation(api.chatMessages.mutations.create, {
        conversationId,
        role: "agent" as const,
        content: message,
        messageType: "error" as const,
      });
    };

    try {
      // 1. Fetch the URL
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; Holocron-Toolbelt/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
      });

      if (!response.ok) {
        await postError(
          `Failed to fetch ${url}: HTTP ${response.status} ${response.statusText}`
        );
        return;
      }

      const html = await response.text();

      // 2. Extract title + description from meta tags
      const { title: rawTitle, description: rawDescription } =
        extractHtmlMetadata(html);

      if (!rawTitle) {
        await postError(
          `Could not extract a title from ${url}. The page may not have standard meta tags.`
        );
        return;
      }

      const title = rawTitle.slice(0, 200);
      const description =
        (rawDescription || `Tool from ${new URL(url).hostname}`).slice(
          0,
          500
        );

      // 3. Infer source type from URL
      const sourceType = inferSourceType(url);

      // 4. Classify via LLM (category, tags, useCases, language)
      const classification = await classifyTool(
        title,
        description,
        sourceType,
        url
      );

      // 5. Insert into toolbelt (reuses duplicate-detection logic)
      const result: { success: boolean; toolId: string; isNew: boolean } =
        await ctx.runMutation(api.toolbelt.mutations.addFromUrl, {
          title,
          description,
          category: classification.category,
          sourceUrl: url,
          sourceType,
          language: classification.language || undefined,
          tags: classification.tags || undefined,
          useCases: classification.useCases || undefined,
        });

      // 6. Post result card — prefer updating the loading message in place
      // so the spinner is replaced by the success card.
      const successContent = result.isNew
        ? `Added **${title}** to your toolbelt.`
        : `**${title}** is already in your toolbelt.`;
      const successCard = {
        card_type: "tool_added" as const,
        tool_id: result.toolId,
        title,
        description,
        category: classification.category,
        source_type: sourceType,
        url,
      };

      if (loadingMessageId) {
        await ctx.runMutation(api.chatMessages.mutations.update, {
          id: loadingMessageId,
          content: successContent,
          messageType: "result_card" as const,
          cardData: successCard,
        });
      } else if (conversationId) {
        await ctx.runMutation(api.chatMessages.mutations.create, {
          conversationId,
          role: "agent" as const,
          content: successContent,
          messageType: "result_card" as const,
          cardData: successCard,
        });
      }
    } catch (error) {
      console.error("[toolbelt.actions.addFromUrl] Failed:", error);
      await postError(
        `Failed to add tool from ${url}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  },
});
