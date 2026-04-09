import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

// Import documents functions to ensure they're deployed
import "./documents/queries";
import "./documents/mutations";
import "./documents/search";
import "./documents/storage";
import "./documents/scheduled";

const http = httpRouter();

http.route({
  pathPrefix: "/article/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const pathParts = url.pathname.split("/");
    const shareToken = pathParts[pathParts.length - 1];

    const doc = await ctx.runQuery(api.documents.queries.getByShareToken, { shareToken });

    if (!doc) {
      return new Response(notFoundHtml(), {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const html = articleHtml(doc);
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }),
});

export default http;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ArticleDoc = {
  title: string;
  content: string;
  category: string;
  date?: string;
  createdAt: number;
  researchType?: string;
};

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function articleHtml(doc: ArticleDoc): string {
  const formattedDate = formatDate(doc.date, doc.createdAt);
  const descriptionText = stripMarkdown(doc.content).slice(0, 200).replace(/"/g, "&quot;");
  const escapedTitle = escapeHtml(doc.title);
  const categoryLabel = escapeHtml(doc.category);
  const researchTypeLabel = doc.researchType ? escapeHtml(doc.researchType) : null;
  // Strip leading heading if it duplicates the document title
  const contentWithoutDuplicateTitle = stripLeadingTitle(doc.content, doc.title);
  const bodyHtml = markdownToHtml(contentWithoutDuplicateTitle);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <meta name="description" content="${descriptionText}" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="${descriptionText}" />
  <meta property="og:type" content="article" />
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html { font-size: 16px; scroll-behavior: smooth; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      background: #ffffff;
      margin: 0;
      padding: 0 16px;
    }
    .container {
      max-width: 720px;
      margin: 48px auto;
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .badge {
      display: inline-block;
      background: #f0f0f0;
      color: #444;
      border-radius: 4px;
      padding: 2px 10px;
      font-size: 0.78rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .date {
      color: #666;
      font-size: 0.85rem;
    }
    h1 {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.25;
      margin: 0 0 28px;
      color: #111;
    }
    h2 { font-size: 1.5rem; font-weight: 700; margin: 2rem 0 0.75rem; color: #111; }
    h3 { font-size: 1.25rem; font-weight: 600; margin: 1.75rem 0 0.6rem; color: #111; }
    h4 { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; color: #111; }
    h5 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.4rem; color: #333; }
    h6 { font-size: 0.95rem; font-weight: 600; margin: 1.25rem 0 0.4rem; color: #555; }
    p { margin: 0 0 1.1rem; }
    a { color: #0066cc; text-decoration: underline; }
    a:hover { color: #004499; }
    h2[id], h3[id], h4[id], h5[id], h6[id] { scroll-margin-top: 24px; }
    strong { font-weight: 700; }
    em { font-style: italic; }
    code {
      background: #f4f4f5;
      border-radius: 4px;
      padding: 2px 5px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.875em;
      color: #d63384;
    }
    pre {
      background: #f4f4f5;
      border-radius: 8px;
      padding: 16px 20px;
      overflow-x: auto;
      margin: 0 0 1.25rem;
    }
    pre code {
      background: none;
      padding: 0;
      color: #1a1a1a;
      font-size: 0.875rem;
    }
    blockquote {
      border-left: 4px solid #d4d4d4;
      margin: 0 0 1.25rem;
      padding: 4px 0 4px 18px;
      color: #555;
    }
    blockquote p:last-child { margin-bottom: 0; }
    ul, ol { margin: 0 0 1.1rem; padding-left: 24px; }
    li { margin-bottom: 4px; }
    hr {
      border: none;
      border-top: 1px solid #e5e5e5;
      margin: 2rem 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 0 0 1.25rem;
      font-size: 0.9rem;
    }
    th, td {
      border: 1px solid #d4d4d4;
      padding: 8px 14px;
      text-align: left;
    }
    th { background: #f4f4f5; font-weight: 600; }
    .content { margin-bottom: 48px; }
    footer {
      border-top: 1px solid #e5e5e5;
      padding-top: 20px;
      font-size: 0.8rem;
      color: #999;
      text-align: center;
    }
    @media (max-width: 600px) {
      h1 { font-size: 1.5rem; }
      .container { margin: 24px auto; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="meta">
      <span class="badge">${categoryLabel}</span>
      ${researchTypeLabel ? `<span class="badge">${researchTypeLabel}</span>` : ""}
      <span class="date">${formattedDate}</span>
    </div>
    <h1>${escapedTitle}</h1>
    <div class="content">
      ${bodyHtml}
    </div>
    <footer>Shared from Holocron</footer>
  </div>
</body>
</html>`;
}

function notFoundHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Article not found</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #fff;
      color: #444;
    }
    .box { text-align: center; padding: 40px; }
    h1 { font-size: 1.5rem; margin-bottom: 12px; color: #111; }
    p { font-size: 1rem; color: #666; }
  </style>
</head>
<body>
  <div class="box">
    <h1>Article not found</h1>
    <p>This article is not found or no longer available.</p>
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Markdown → HTML (self-contained, no external packages)
// ---------------------------------------------------------------------------

function markdownToHtml(md: string): string {
  // Normalize line endings
  let text = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Protect fenced code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```([^\n]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
    const langAttr = lang.trim() ? ` class="language-${escapeHtml(lang.trim())}"` : "";
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code${langAttr}>${escapeHtml(code)}</code></pre>`);
    return `\x00CODE${idx}\x00`;
  });

  // Tables: detect rows with | separators
  text = text.replace(/((?:\|[^\n]+\|\n)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split("\n");
    if (rows.length < 2) return tableBlock;

    const parseRow = (row: string) =>
      row
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());

    const isSeparator = (row: string) => /^\s*\|?[\s\-:|]+\|/.test(row);

    let html = "<table>\n";
    let headerDone = false;
    let inBody = false;

    for (let i = 0; i < rows.length; i++) {
      if (isSeparator(rows[i])) {
        if (!headerDone) {
          html += "</tr></thead>\n<tbody>\n";
          headerDone = true;
          inBody = true;
        }
        continue;
      }
      const cells = parseRow(rows[i]);
      if (!headerDone && i === 0) {
        html += "<thead>\n<tr>";
        cells.forEach((c) => (html += `<th>${inlineMarkdown(c)}</th>`));
      } else {
        if (!inBody) { html += "<tbody>\n"; inBody = true; }
        html += "<tr>";
        cells.forEach((c) => (html += `<td>${inlineMarkdown(c)}</td>`));
        html += "</tr>\n";
      }
    }
    if (inBody) html += "</tbody>\n";
    html += "</table>";
    return html;
  });

  // Line-by-line block processing
  // Classify each line, then group consecutive lines of the same type
  const NUL = "\x00";
  const codePlaceholderTest = new RegExp(`^${NUL}CODE\\d+${NUL}$`);
  const codePlaceholderCapture = new RegExp(`${NUL}CODE(\\d+)${NUL}`);

  const lines = text.split("\n");
  const output: string[] = [];
  let paragraphLines: string[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let blockquoteLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      output.push(`<p>${paragraphLines.map((l) => inlineMarkdown(l)).join(" ")}</p>`);
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0 && listType) {
      const tag = listType;
      const items = listItems.map((l) => `<li>${inlineMarkdown(l)}</li>`).join("\n");
      output.push(`<${tag}>\n${items}\n</${tag}>`);
      listItems = [];
      listType = null;
    }
  };

  const flushBlockquote = () => {
    if (blockquoteLines.length > 0) {
      const inner = blockquoteLines.join("\n").trim();
      // Recursively parse blockquote content
      output.push(`<blockquote>${markdownToHtml(inner)}</blockquote>`);
      blockquoteLines = [];
    }
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
    flushBlockquote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line: flush current context
    if (trimmed === "") {
      flushAll();
      continue;
    }

    // Code block placeholder
    if (codePlaceholderTest.test(trimmed)) {
      flushAll();
      const idx = parseInt(trimmed.replace(codePlaceholderCapture, "$1"), 10);
      output.push(codeBlocks[idx]);
      continue;
    }

    // Already HTML (from table conversion)
    if (/^<(table|thead|tbody|tr|th|td)/.test(trimmed)) {
      flushAll();
      output.push(trimmed);
      continue;
    }

    // ATX headings
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      const slug = slugifyText(headingText);
      output.push(`<h${level} id="${slug}">${inlineMarkdown(headingText)}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(trimmed)) {
      flushAll();
      output.push("<hr />");
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      blockquoteLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    // If we were in a blockquote but this line doesn't start with >, flush it
    if (blockquoteLines.length > 0) {
      flushBlockquote();
    }

    // Unordered list item
    const ulMatch = trimmed.match(/^[*\-+]\s+(.*)/);
    if (ulMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType === "ol") flushList();
      listType = "ul";
      listItems.push(ulMatch[1]);
      continue;
    }

    // Ordered list item
    const olMatch = trimmed.match(/^\d+\.\s+(.*)/);
    if (olMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType === "ul") flushList();
      listType = "ol";
      listItems.push(olMatch[1]);
      continue;
    }

    // If we were in a list but this line isn't a list item, flush the list
    if (listItems.length > 0) {
      flushList();
    }

    // Regular text: accumulate as paragraph
    paragraphLines.push(trimmed);
  }

  // Flush any remaining content
  flushAll();

  let result = output.filter(Boolean).join("\n");

  // Restore any remaining code block placeholders (e.g. inline in paragraphs)
  const codePlaceholderGlobal = new RegExp(`${NUL}CODE(\\d+)${NUL}`, "g");
  result = result.replace(codePlaceholderGlobal, (_m, idx) => codeBlocks[parseInt(idx, 10)]);

  return result;
}

function inlineMarkdown(text: string): string {
  // Inline code (protect first)
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x01IC${idx}\x01`;
  });

  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");
  // Italic
  text = text.replace(/\*(.+?)\*/g, "<em>$1</em>");
  text = text.replace(/_(.+?)_/g, "<em>$1</em>");

  // Links (support both external URLs and internal #anchor links)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    if (href.startsWith("#")) {
      const slug = slugifyText(href.slice(1));
      return `<a href="#${slug}">${escapeHtml(label)}</a>`;
    }
    const safeHref = href.startsWith("http") ? escapeHtml(href) : "#";
    return `<a href="${safeHref}" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });

  // Restore inline codes
  const SOH = "\x01";
  const icPlaceholderGlobal = new RegExp(`${SOH}IC(\\d+)${SOH}`, "g");
  text = text.replace(icPlaceholderGlobal, (_m, idx) => inlineCodes[parseInt(idx, 10)]);

  return text;
}

function slugifyText(text: string): string {
  // Strip inline markdown formatting before slugifying
  const plain = text
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
  return plain
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripLeadingTitle(content: string, title: string): string {
  // Remove a leading markdown heading (# or ##) if its text matches the document title.
  // Normalizes whitespace and ignores case for comparison.
  const normalize = (s: string) =>
    s.replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const normalizedTitle = normalize(title);

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "") continue; // skip leading blank lines
    const headingMatch = trimmed.match(/^#{1,2}\s+(.+)$/);
    if (headingMatch && normalize(headingMatch[1]) === normalizedTitle) {
      // Remove this line and any immediately following blank lines
      lines.splice(i, 1);
      while (i < lines.length && lines[i].trim() === "") {
        lines.splice(i, 1);
      }
      return lines.join("\n");
    }
    break; // first non-blank line wasn't a matching heading, stop
  }
  return content;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/#{1,6}\s+/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[>*\-+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

function formatDate(date: string | undefined, createdAt: number): string {
  const d = date ? new Date(date) : new Date(createdAt);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
