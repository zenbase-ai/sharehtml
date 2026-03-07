/** @jsxImportSource hono/jsx */
import { raw } from "hono/utils/html";
import type { HtmlEscapedString } from "hono/utils/html";

interface TokensParams {
  email: string;
  existing: { token_hash: string; created_at: string; expires_at: string } | null;
}

function ActiveTokenCard({ existing }: { existing: { token_hash: string; created_at: string; expires_at: string } }) {
  const expired = new Date(existing.expires_at + "Z") <= new Date();
  return (
    <div class="token-card">
      <div class="token-card-top">
        <span class={`token-card-title${expired ? " token-expired" : ""}`}>
          {expired ? "expired" : "active"}
        </span>
        <span class="token-card-hash">{existing.token_hash.slice(0, 8)}...</span>
      </div>
      <div class="token-card-bottom">
        <span class="token-card-meta">
          expires {existing.expires_at.split("T")[0]}
        </span>
        <span class="token-card-actions">
          <button class="token-action" id="regenerate-btn">
            regenerate
          </button>
          <button class="token-action token-action-danger" id="revoke-btn">
            revoke
          </button>
        </span>
      </div>
    </div>
  );
}

function EmptyTokenCard() {
  return (
    <div class="token-card token-card-empty">
      <div class="token-card-top">
        <span class="token-card-meta">no token configured</span>
      </div>
      <div class="token-card-bottom">
        <span></span>
        <button class="token-action" id="generate-btn">
          generate
        </button>
      </div>
    </div>
  );
}

export function TokensView({ email, existing }: TokensParams): HtmlEscapedString {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>API token — sharehtml</title>
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
            text-decoration: none;
            color: inherit;
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
          .token-card {
            border: 1px solid #d4d4d4;
            border-radius: 4px;
            padding: 12px;
            transition: border-color 120ms ease;
            animation: fadeIn 150ms ease;
          }
          .token-card-top {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 4px;
          }
          .token-card-title {
            font-size: 14px;
            font-weight: 500;
          }
          .token-expired { color: #e11d48; }
          .token-card-hash {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
          }
          .token-card-bottom {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
          }
          .token-card-meta {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
          }
          .token-card-actions {
            display: flex;
            gap: 8px;
          }
          .token-action {
            background: none;
            border: none;
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #737373;
            cursor: pointer;
            padding: 0;
            transition: color 120ms ease;
          }
          .token-action::before { content: "["; }
          .token-action::after { content: "]"; }
          .token-action:hover { color: #000000; }
          .token-action-danger:hover { color: #e11d48; }
          .new-token-box {
            display: none;
            margin-top: 12px;
            padding: 12px;
            border: 1px solid #d4d4d4;
            border-radius: 4px;
            animation: fadeIn 150ms ease;
          }
          .new-token-label {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #737373;
            margin-bottom: 8px;
          }
          .new-token-value {
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            font-size: 13px;
            word-break: break-all;
            user-select: all;
            padding: 8px;
            background: #fafafa;
            border-radius: 4px;
            margin-bottom: 8px;
          }
          .new-token-hint {
            font-size: 12px;
            font-family: "SF Mono", "Fira Code", "Fira Mono", Menlo, monospace;
            color: #a3a3a3;
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
          <a class="topbar-title" href="/">
            sharehtml
          </a>
          <span class="topbar-email">{email}</span>
        </div>
        <div class="content">
          <div class="section">
            <div class="section-label">api token</div>
            <div id="token-card-container">
              {existing ? <ActiveTokenCard existing={existing} /> : <EmptyTokenCard />}
            </div>
            <div class="new-token-box" id="new-token-box">
              <div class="new-token-label">copy this token — it won't be shown again</div>
              <div class="new-token-value" id="new-token-value"></div>
              <div class="new-token-hint">expires in 90 days · {raw(`sharehtml config set-key &lt;token&gt;`)}</div>
            </div>
          </div>
        </div>
        <script>
          {raw(`
          const container = document.getElementById('token-card-container');
          const tokenBox = document.getElementById('new-token-box');

          async function generateToken() {
            const resp = await fetch('/tokens/generate', { method: 'POST' });
            if (!resp.ok) return;
            const { token } = await resp.json();
            document.getElementById('new-token-value').textContent = token;
            tokenBox.style.display = 'block';
            const pageResp = await fetch(location.href);
            const html = new DOMParser().parseFromString(await pageResp.text(), 'text/html');
            container.innerHTML = html.getElementById('token-card-container').innerHTML;
          }

          async function revokeToken() {
            const resp = await fetch('/tokens/revoke', { method: 'POST' });
            if (!resp.ok) return;
            tokenBox.style.display = 'none';
            const pageResp = await fetch(location.href);
            const html = new DOMParser().parseFromString(await pageResp.text(), 'text/html');
            container.innerHTML = html.getElementById('token-card-container').innerHTML;
          }

          container.addEventListener('click', (e) => {
            if (e.target.closest('#generate-btn') || e.target.closest('#regenerate-btn')) {
              generateToken();
            } else if (e.target.closest('#revoke-btn')) {
              revokeToken();
            }
          });
        `)}
        </script>
      </body>
    </html>
  ) as unknown as HtmlEscapedString;
}
