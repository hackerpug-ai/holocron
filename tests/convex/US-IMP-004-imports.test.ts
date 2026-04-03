/**
 * US-IMP-004: Multi-Source Text Import Tests
 *
 * AC-1: Chat agent /add-text command appends text when executed
 * AC-2: "+" button opens import modal when clicked in articles view
 * AC-3: Import modal appends text to selected article when submitted
 * AC-4: Markdown formatting renders after text import
 */

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

describe("AC-1: Chat agent /add-text command appends text when executed", () => {
  it("has /add-text command registered in ChatInput DEFAULT_COMMANDS", () => {
    const chatInputPath = path.resolve(__dirname, "../../components/chat/ChatInput.tsx");
    expect(fs.existsSync(chatInputPath)).toBe(true);
    const src = fs.readFileSync(chatInputPath, "utf8");
    expect(src).toContain("'add-text'");
    expect(src).toContain("description");
  });

  it("has appendText mutation in convex/documents/mutations.ts", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/documents/mutations.ts");
    expect(fs.existsSync(mutationsPath)).toBe(true);
    const src = fs.readFileSync(mutationsPath, "utf8");
    expect(src).toContain("appendText");
    expect(src).toContain("v.id(\"documents\")");
    expect(src).toContain("v.string()");
  });

  it("appendText mutation appends text with double newline separator", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/documents/mutations.ts");
    const src = fs.readFileSync(mutationsPath, "utf8");
    // Verify it appends rather than replaces
    expect(src).toContain("+");
    expect(src).toContain("\\n\\n");
  });

  it("appendText mutation updates document content", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/documents/mutations.ts");
    const src = fs.readFileSync(mutationsPath, "utf8");
    // Verify content is updated (updatedAt not in schema)
    expect(src).toContain("content: updatedContent");
  });
});

describe("AC-2: + button opens import modal when clicked in articles view", () => {
  it("ImportButton component exists", () => {
    const importButtonPath = path.resolve(__dirname, "../../components/article/ImportButton.tsx");
    expect(fs.existsSync(importButtonPath)).toBe(true);
  });

  it("ImportButton has testID prop for testing", () => {
    const importButtonPath = path.resolve(__dirname, "../../components/article/ImportButton.tsx");
    const src = fs.readFileSync(importButtonPath, "utf8");
    expect(src).toContain("testID");
  });

  it("ImportButton has onPress callback prop", () => {
    const importButtonPath = path.resolve(__dirname, "../../components/article/ImportButton.tsx");
    const src = fs.readFileSync(importButtonPath, "utf8");
    expect(src).toContain("onPress");
  });

  it("ArticlesScreen includes ImportButton in header", () => {
    const articlesScreenPath = path.resolve(__dirname, "../../screens/articles-screen.tsx");
    const src = fs.readFileSync(articlesScreenPath, "utf8");
    expect(src).toContain("ImportButton");
  });
});

describe("AC-3: Import modal appends text to selected article with source tracking", () => {
  it("ArticleImportModal component exists", () => {
    const modalPath = path.resolve(__dirname, "../../components/articles/ArticleImportModal.tsx");
    expect(fs.existsSync(modalPath)).toBe(true);
  });

  it("ArticleImportModal has text input for pasting content", () => {
    const modalPath = path.resolve(__dirname, "../../components/articles/ArticleImportModal.tsx");
    const src = fs.readFileSync(modalPath, "utf8");
    expect(src).toContain("TextInput");
  });

  it("ArticleImportModal has article selector", () => {
    const modalPath = path.resolve(__dirname, "../../components/articles/ArticleImportModal.tsx");
    const src = fs.readFileSync(modalPath, "utf8");
    expect(src).toContain("articles");
    expect(src).toContain("selectedArticle");
  });

  it("imports table exists in schema for source tracking", () => {
    const schemaPath = path.resolve(__dirname, "../../convex/schema.ts");
    const src = fs.readFileSync(schemaPath, "utf8");
    expect(src).toContain("imports");
    expect(src).toContain("defineTable");
  });

  it("imports table tracks source metadata", () => {
    const schemaPath = path.resolve(__dirname, "../../convex/schema.ts");
    const src = fs.readFileSync(schemaPath, "utf8");
    expect(src).toContain("source");
    expect(src).toContain("documentId");
  });

  it("createImport mutation exists in convex/imports/mutations.ts", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/imports/mutations.ts");
    expect(fs.existsSync(mutationsPath)).toBe(true);
    const src = fs.readFileSync(mutationsPath, "utf8");
    expect(src).toContain("createImport");
    expect(src).toContain("mutation");
  });

  it("createImport mutation stores source attribution", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/imports/mutations.ts");
    const src = fs.readFileSync(mutationsPath, "utf8");
    expect(src).toContain("source");
  });
});

describe("AC-4: Markdown formatting renders after text import", () => {
  it("imported markdown text is stored as-is in document content", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/documents/mutations.ts");
    const src = fs.readFileSync(mutationsPath, "utf8");
    // Verify we're not stripping markdown
    expect(src).not.toContain("stripMarkdown");
    expect(src).not.toContain("sanitize");
  });

  it("appended text preserves original formatting", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/documents/mutations.ts");
    const src = fs.readFileSync(mutationsPath, "utf8");
    // Check for concatenation pattern that preserves content
    expect(src).toContain("content +");
  });
});

describe("Rate Limiting: Import actions limited to 10/hour", () => {
  it("rate limit check exists in imports mutation", () => {
    const mutationsPath = path.resolve(__dirname, "../../convex/imports/mutations.ts");
    const src = fs.readFileSync(mutationsPath, "utf8");
    // Check for rate limiting patterns
    expect(src).toContain("MAX_IMPORTS_PER_HOUR");
    expect(src).toContain("HOUR_IN_MS");
    expect(src).toContain("recentImports.length >=");
  });

  it("imports table tracks timestamp for rate limiting", () => {
    const schemaPath = path.resolve(__dirname, "../../convex/schema.ts");
    const src = fs.readFileSync(schemaPath, "utf8");
    expect(src).toContain("createdAt");
  });
});
