import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

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
  const bodyHtml = markdownToHtml(doc.content);

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
    html { font-size: 16px; }
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

  // Block-level processing: split into blocks by blank lines
  const blocks = text.split(/\n{2,}/);
  const processed = blocks.map((block) => {
    // Restore code blocks
    if (/^\x00CODE\d+\x00$/.test(block.trim())) {
      const idx = parseInt(block.trim().replace(/\x00CODE(\d+)\x00/, "$1"), 10);
      return codeBlocks[idx];
    }

    // Already HTML (from table conversion)
    if (/^<(table|thead|tbody|tr|th|td)/.test(block.trim())) {
      return block.trim();
    }

    // ATX headings
    const headingMatch = block.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      return `<h${level}>${inlineMarkdown(headingMatch[2].trim())}</h${level}>`;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(block.trim())) {
      return "<hr />";
    }

    // Blockquote
    if (block.trim().startsWith(">")) {
      const inner = block
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n");
      return `<blockquote><p>${inlineMarkdown(inner.trim())}</p></blockquote>`;
    }

    // Unordered list
    if (/^[*\-+]\s/.test(block.trim())) {
      const items = block
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `<li>${inlineMarkdown(l.replace(/^[*\-+]\s+/, ""))}</li>`)
        .join("\n");
      return `<ul>\n${items}\n</ul>`;
    }

    // Ordered list
    if (/^\d+\.\s/.test(block.trim())) {
      const items = block
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `<li>${inlineMarkdown(l.replace(/^\d+\.\s+/, ""))}</li>`)
        .join("\n");
      return `<ol>\n${items}\n</ol>`;
    }

    // Paragraph
    const lines = block.split("\n").filter((l) => l.trim());
    if (lines.length === 0) return "";
    return `<p>${lines.map((l) => inlineMarkdown(l)).join(" ")}</p>`;
  });

  let result = processed.filter(Boolean).join("\n");

  // Restore any remaining code block placeholders (e.g. inline in paragraphs)
  result = result.replace(/\x00CODE(\d+)\x00/g, (_m, idx) => codeBlocks[parseInt(idx, 10)]);

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

  // Links
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
    const safeHref = href.startsWith("http") ? escapeHtml(href) : "#";
    return `<a href="${safeHref}" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  });

  // Restore inline codes
  text = text.replace(/\x01IC(\d+)\x01/g, (_m, idx) => inlineCodes[parseInt(idx, 10)]);

  return text;
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
