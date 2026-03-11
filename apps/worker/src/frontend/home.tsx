/** @jsxImportSource hono/jsx */
import { raw } from "hono/utils/html";
import type { HtmlEscapedString } from "hono/utils/html";

interface Document {
  id: string;
  title: string;
  filename: string;
  size: number;
  owner_email: string;
  created_at: string;
  last_viewed_at?: string;
}

interface HomeParams {
  email: string;
  workerUrl: string;
  documents: Document[];
  recentViews: Document[];
  query: string;
  page: number;
  pageSize: number;
  totalCount: number;
  requiresLogin: boolean;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr + "Z").getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatSize(bytes: number): string {
  return (bytes / 1024).toFixed(1) + "KB";
}

function DocCard({ doc, subtitle }: { doc: Document; subtitle: string }) {
  return (
    <a class="doc-card" href={`/d/${doc.id}`}>
      <div class="doc-card-top">
        <span class="doc-card-title">{doc.title}</span>
        <span class="doc-card-filename">{doc.filename}</span>
      </div>
      <div class="doc-card-bottom">
        <span class="doc-card-meta">{subtitle}</span>
        <span class="doc-card-meta">{relativeTime(doc.created_at)}</span>
      </div>
    </a>
  );
}

function RecentDocCard({ doc }: { doc: Document }) {
  const viewedAt = doc.last_viewed_at || doc.created_at;

  return (
    <a class="recent-card" href={`/d/${doc.id}`}>
      <div class="recent-card-title">{doc.title}</div>
      <div class="recent-card-filename">{doc.filename}</div>
      <div class="recent-card-meta">viewed {relativeTime(viewedAt)}</div>
    </a>
  );
}

function buildHomePath(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) {
    params.set("q", query);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const search = params.toString();
  return search ? `/?${search}` : "/";
}

function getHomeSearchScript(pageSize: number, workerUrl: string, page: number): string {
  return `
    (() => {
      const form = document.querySelector(".docs-search-form");
      const input = document.querySelector(".docs-search-input");
      const list = document.getElementById("documents-list");
      const pagination = document.getElementById("documents-pagination");
      const meta = document.getElementById("documents-meta");
      const setupTemplate = document.getElementById("documents-setup-template");
      if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return;
      if (!(list instanceof HTMLDivElement) || !(pagination instanceof HTMLDivElement)) return;
      if (!(meta instanceof HTMLDivElement) || !(setupTemplate instanceof HTMLTemplateElement)) return;

      let timer = 0;
      let requestId = 0;
      let currentQuery = input.value.trim();
      let currentPage = ${page};
      const pageSize = ${pageSize};

      function escapeHtml(value) {
        return value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }

      function relativeTime(dateStr) {
        const now = Date.now();
        const then = new Date(dateStr + "Z").getTime();
        const diff = now - then;
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return "now";
        if (mins < 60) return mins + "m";
        const hours = Math.floor(mins / 60);
        if (hours < 24) return hours + "h";
        const days = Math.floor(hours / 24);
        if (days < 30) return days + "d";
        return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }

      function formatSize(bytes) {
        return (bytes / 1024).toFixed(1) + "KB";
      }

      function buildPath(query, page) {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (page > 1) params.set("page", String(page));
        const search = params.toString();
        return search ? "/?" + search : "/";
      }

      function renderDocuments(documents, query) {
        if (documents.length > 0) {
          list.innerHTML = documents.map((doc) => \`
            <a class="doc-card" href="/d/\${escapeHtml(doc.id)}">
              <div class="doc-card-top">
                <span class="doc-card-title">\${escapeHtml(doc.title)}</span>
                <span class="doc-card-filename">\${escapeHtml(doc.filename)}</span>
              </div>
              <div class="doc-card-bottom">
                <span class="doc-card-meta">\${formatSize(doc.size)}</span>
                <span class="doc-card-meta">\${relativeTime(doc.created_at)}</span>
              </div>
            </a>
          \`).join("");
          return;
        }

        if (query) {
          list.innerHTML = \`<div class="section-empty">no documents match "\${escapeHtml(query)}"</div>\`;
          return;
        }

        list.innerHTML = setupTemplate.innerHTML;
      }

      function renderPagination(totalCount, page, query) {
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
        if (totalCount === 0 || totalPages <= 1) {
          pagination.innerHTML = "";
          return;
        }

        const previous = page > 1
          ? \`<a class="docs-pagination-link" href="\${buildPath(query, page - 1)}" data-page="\${page - 1}">previous</a>\`
          : '<div class="docs-pagination-spacer"></div>';
        const next = page < totalPages
          ? \`<a class="docs-pagination-link" href="\${buildPath(query, page + 1)}" data-page="\${page + 1}">next</a>\`
          : '<div class="docs-pagination-spacer"></div>';

        pagination.innerHTML = \`
          \${previous}
          <div class="docs-pagination-status">page \${page} of \${totalPages}</div>
          \${next}
        \`;
      }

      function renderMeta(totalCount, query) {
        const label = query
          ? totalCount + " match" + (totalCount === 1 ? "" : "es")
          : totalCount + " document" + (totalCount === 1 ? "" : "s");
        meta.textContent = label;
      }

      function updateUrl(query, page) {
        window.history.replaceState({}, "", buildPath(query, page));
      }

      async function loadDocuments(query, page) {
        const nextRequestId = ++requestId;
        const searchParams = new URLSearchParams();
        if (query) searchParams.set("q", query);
        searchParams.set("page", String(page));
        searchParams.set("limit", String(pageSize));

        const response = await fetch("${workerUrl}/api/documents?" + searchParams.toString(), {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;

        const data = await response.json();
        if (nextRequestId !== requestId) return;

        currentQuery = data.query || "";
        currentPage = data.page || 1;
        renderDocuments(data.documents || [], currentQuery);
        renderPagination(data.totalCount || 0, currentPage, currentQuery);
        renderMeta(data.totalCount || 0, currentQuery);
        updateUrl(currentQuery, currentPage);
      }

      function submitSearch() {
        const nextValue = input.value.trim();
        if (nextValue === currentQuery) return;
        loadDocuments(nextValue, 1);
      }

      input.addEventListener("input", () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(submitSearch, 120);
      });

      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        window.clearTimeout(timer);
        submitSearch();
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        window.clearTimeout(timer);
        submitSearch();
      });

      pagination.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const link = target.closest("[data-page]");
        if (!(link instanceof HTMLAnchorElement)) return;
        const page = Number.parseInt(link.dataset.page || "", 10);
        if (!Number.isFinite(page) || page < 1) return;
        event.preventDefault();
        loadDocuments(currentQuery, page);
      });
    })();
  `;
}

export function HomeView({
  email,
  workerUrl,
  documents,
  recentViews,
  query,
  page,
  pageSize,
  totalCount,
  requiresLogin,
}: HomeParams): HtmlEscapedString {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const hasDocuments = totalCount > 0;
  const hasQuery = query.length > 0;
  const previousPageHref = buildHomePath(query, page - 1);
  const nextPageHref = buildHomePath(query, page + 1);
  const resultsLabel = hasQuery
    ? `${totalCount} match${totalCount === 1 ? "" : "es"}`
    : `${totalCount} document${totalCount === 1 ? "" : "s"}`;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>sharehtml</title>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <style>
          {raw(`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #000000;
            background: #ffffff;
            height: 100vh;
            overflow-y: auto;
          }
          .topbar {
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
            border-bottom: 1px solid #000000;
            background: #ffffff;
            position: sticky;
            top: 0;
            z-index: 10;
          }
          .topbar-title {
            font-size: 14px;
            font-weight: 500;
          }
          .topbar-right {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .topbar-email {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
          }
          .content {
            max-width: 640px;
            margin: 0 auto;
            padding: 32px 16px;
          }
          .section {
            margin-bottom: 32px;
          }
          .section-label {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #737373;
            margin-bottom: 12px;
          }
          .section-header {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 12px;
          }
          .section-meta {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
            white-space: nowrap;
          }
          .section-empty {
            font-size: 13px;
            color: #a3a3a3;
            padding: 16px 0;
          }
          .docs-search-form {
            margin-bottom: 12px;
          }
          .docs-search-input {
            width: 100%;
            border: none;
            border-bottom: 1px solid #000000;
            padding: 8px 0;
            font-size: 13px;
            outline: none;
            background: none;
            min-width: 0;
          }
          .docs-search-input::placeholder {
            color: #a3a3a3;
          }
          .docs-pagination-link {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 32px;
            padding: 0 12px;
            border: 1px solid #000000;
            border-radius: 4px;
            background: #ffffff;
            color: #000000;
            text-decoration: none;
            font-size: 12px;
            cursor: pointer;
            transition: all 120ms ease;
          }
          .docs-search-submit:hover,
          .docs-pagination-link:hover {
            background: #000000;
            color: #ffffff;
          }
          .docs-pagination {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-top: 12px;
          }
          .docs-pagination-status {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
            text-align: center;
            flex: 1;
          }
          .docs-pagination-spacer {
            width: 72px;
            flex-shrink: 0;
          }
          .doc-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .recent-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
          }
          .recent-card {
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 112px;
            border: 1px solid #d4d4d4;
            border-radius: 4px;
            padding: 12px;
            text-decoration: none;
            color: inherit;
            transition: border-color 120ms ease;
            animation: fadeIn 150ms ease;
          }
          .recent-card:hover {
            border-color: #000000;
          }
          .recent-card-title {
            font-size: 14px;
            font-weight: 500;
            line-height: 1.35;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            margin-bottom: 10px;
          }
          .recent-card-filename {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            margin-bottom: 14px;
          }
          .recent-card-meta {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #737373;
          }
          .doc-card {
            display: block;
            border: 1px solid #d4d4d4;
            border-radius: 4px;
            padding: 12px;
            text-decoration: none;
            color: inherit;
            transition: border-color 120ms ease;
            animation: fadeIn 150ms ease;
          }
          .doc-card:hover {
            border-color: #000000;
          }
          .doc-card-top {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 4px;
          }
          .doc-card-title {
            font-size: 14px;
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .doc-card-filename {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
            flex-shrink: 0;
          }
          .doc-card-bottom {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
          }
          .doc-card-meta {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
          }
          .setup-block {
            border: 1px solid #d4d4d4;
            border-radius: 4px;
            padding: 20px;
          }
          .setup-block p {
            font-size: 13px;
            color: #737373;
            margin-bottom: 16px;
            line-height: 1.5;
          }
          .setup-block p a {
            color: #000000;
          }
          .setup-block pre {
            background: #f5f5f5;
            border: 1px solid #d4d4d4;
            border-radius: 4px;
            padding: 12px 14px;
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            line-height: 1.7;
            overflow-x: auto;
            white-space: pre;
            color: #000000;
          }
          .setup-block .cmd-comment {
            color: #a3a3a3;
          }
          @media (max-width: 768px) {
            .section-header {
              align-items: flex-start;
              flex-direction: column;
              gap: 4px;
            }
            .docs-pagination {
              gap: 8px;
            }
            .docs-pagination-link,
            .docs-pagination-spacer {
              width: 72px;
            }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `)}
        </style>
      </head>
      <body>
        <div class="topbar">
          <div class="topbar-title">sharehtml</div>
          <div class="topbar-right">
            <span class="topbar-email">{email}</span>
          </div>
        </div>
        <div class="content">
          <div class="section">
            <div class="section-label">recently viewed</div>
            <div class="recent-grid">
              {recentViews.length > 0 ? (
                recentViews.map((d) => <RecentDocCard doc={d} />)
              ) : (
                <div class="section-empty">no recently viewed documents</div>
              )}
            </div>
          </div>
          <div class="section">
            <div class="section-header">
              <div class="section-label">my documents</div>
              <div class="section-meta" id="documents-meta">{resultsLabel}</div>
            </div>
            <form class="docs-search-form" method="get" action="/">
              <input
                class="docs-search-input"
                type="text"
                name="q"
                value={query}
                placeholder="search by title or filename"
                autocomplete="off"
              />
            </form>
            <div class="doc-list" id="documents-list">
              {documents.length > 0 ? (
                documents.map((d) => <DocCard doc={d} subtitle={formatSize(d.size)} />)
              ) : hasQuery ? (
                <div class="section-empty">no documents match "{query}"</div>
              ) : (
                <div class="setup-block">
                  <p>
                    Deploy HTML or Markdown files with the{" "}
                    <a href="https://github.com/jonesphillip/sharehtml">sharehtml CLI</a>, then:
                  </p>
                  {raw(`<pre><span class="cmd-comment"># install the CLI</span>
git clone https://github.com/jonesphillip/sharehtml.git
cd sharehtml && pnpm install
cd apps/cli && pnpm build && bun link

<span class="cmd-comment"># configure</span>
sharehtml config set-url ${workerUrl}
${requiresLogin ? "sharehtml login\n" : ""}

<span class="cmd-comment"># deploy a file</span>
sharehtml deploy example/coffee-report.html</pre>`)}
                </div>
              )}
            </div>
            <template id="documents-setup-template">
              <div class="setup-block">
                <p>
                  Deploy HTML or Markdown files with the{" "}
                  <a href="https://github.com/jonesphillip/sharehtml">sharehtml CLI</a>, then:
                </p>
                {raw(`<pre><span class="cmd-comment"># install the CLI</span>
git clone https://github.com/jonesphillip/sharehtml.git
cd sharehtml && pnpm install
cd apps/cli && pnpm build && bun link

<span class="cmd-comment"># configure</span>
sharehtml config set-url ${workerUrl}
${requiresLogin ? "sharehtml login\n" : ""}

<span class="cmd-comment"># deploy a file</span>
sharehtml deploy example/coffee-report.html</pre>`)}
              </div>
            </template>
            {hasDocuments && totalPages > 1 && (
              <div class="docs-pagination" id="documents-pagination">
                {page > 1 ? (
                  <a class="docs-pagination-link" href={previousPageHref} data-page={page - 1}>
                    previous
                  </a>
                ) : (
                  <div class="docs-pagination-spacer"></div>
                )}
                <div class="docs-pagination-status">
                  page {page} of {totalPages}
                </div>
                {page < totalPages ? (
                  <a class="docs-pagination-link" href={nextPageHref} data-page={page + 1}>
                    next
                  </a>
                ) : (
                  <div class="docs-pagination-spacer"></div>
                )}
              </div>
            )}
            {!hasDocuments || totalPages <= 1 ? (
              <div class="docs-pagination" id="documents-pagination"></div>
            ) : null}
          </div>
        </div>
        <script>{raw(getHomeSearchScript(pageSize, workerUrl, page))}</script>
      </body>
    </html>
  ) as unknown as HtmlEscapedString;
}
