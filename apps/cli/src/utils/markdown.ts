import { readFileSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function isMarkdownFile(filename: string): boolean {
  return /\.(md|markdown)$/i.test(filename);
}

export function markdownFilenameToHtml(filename: string): string {
  return filename.replace(/\.(md|markdown)$/i, ".html");
}

function inlineRelativeImages(markdown: string, filePath: string): string {
  const dir = dirname(filePath);

  return markdown.replace(
    /!\[([^\]]*)\]\((\.[^)]+)\)/g,
    (_match, alt: string, imgPath: string) => {
      const absPath = resolve(dir, imgPath);
      try {
        const data = readFileSync(absPath).toString("base64");
        const ext = extname(absPath).slice(1).toLowerCase();
        const mime =
          ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        return `![${alt}](data:${mime};base64,${data})`;
      } catch {
        console.error(`Warning: image not found: ${imgPath}`);
        return _match;
      }
    },
  );
}

export function renderMarkdownToHtml(markdown: string, title: string, filePath: string): string {
  const processed = inlineRelativeImages(markdown, filePath);
  const body = marked.parse(processed) as string;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
  font-size: 13px;
  line-height: 1.6;
  max-width: 860px;
  margin: 0 auto;
  padding: 32px 24px;
  color: #000;
  background: #fff;
}
h1 { font-size: 16px; font-weight: bold; margin: 24px 0 12px; }
h2 { font-size: 14px; font-weight: bold; margin: 20px 0 10px; }
h3 { font-size: 13px; font-weight: bold; margin: 16px 0 8px; }
table { border-collapse: collapse; width: 100%; font-size: 12px; margin: 16px 0; }
th { font-weight: bold; border-bottom: 2px solid #000; padding: 6px 8px; text-align: left; }
td { border-bottom: 1px solid #ddd; padding: 6px 8px; }
pre { background: #f5f5f5; border: 1px solid #ddd; padding: 12px; overflow-x: auto; margin: 16px 0; }
pre code { background: none; border: none; padding: 0; }
code { background: #f5f5f5; padding: 2px 4px; font-size: 12px; }
blockquote { border-left: 2px solid #999; margin: 16px 0; padding: 4px 16px; color: #444; }
hr { border: none; border-top: 1px solid #000; margin: 24px 0; }
img { max-width: 100%; }
a { color: #000; text-decoration: underline; }
ul, ol { padding-left: 24px; }
li { margin: 4px 0; }
input[type="checkbox"] { margin-right: 6px; }
@media (max-width: 600px) {
  body { padding: 16px 12px; font-size: 12px; }
  h1 { font-size: 15px; }
  h2 { font-size: 13px; }
  table { font-size: 11px; }
}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
