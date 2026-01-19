/// <reference types="@cloudflare/workers-types" />

import {
  OAuthProviders,
  IdpMiddlewareEnv,
} from "../../packages/idp-middleware/idp-middleware";

export { OAuthProviders };

export interface Env extends IdpMiddlewareEnv {
  OPENAI_KEYS: KVNamespace;
  OAuthProviders: DurableObjectNamespace<OAuthProviders>;
}

export interface UserContext extends ExecutionContext {
  user?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
  accessToken?: string;
  authenticated: boolean;
}

export const MODEL = "gpt-5.2-2025-12-11";

export const DEFAULT_SYSTEM_PROMPT = `When outputting files, always put them inside of fenced code blocks with 5 backticks that indicate both extension and path, e.g.

\`\`\`\`\`js path="index.js"
console.log("hello,world!");
// A comment with backticks preventing from using 3 or 4 backticks: \`\`\`\`
\`\`\`\`\`

Use tildes (\`~~~~~\`) instead of backticks for fenced code blocks when dealing with backtick-heavy content.

When the user requests binary files you can insert them by passing a URL as content of a named codeblock (NB: one url per file!)`;

export const STYLES = `
  @font-face {
    font-family: 'FT System Mono';
    src: url('https://assets.parallel.ai/FTSystemMono-Regular.woff2') format('woff2');
    font-weight: 400;
  }
  @font-face {
    font-family: 'FT System Mono';
    src: url('https://assets.parallel.ai/FTSystemMono-Medium.woff2') format('woff2');
    font-weight: 500;
  }
  @font-face {
    font-family: 'FT System Mono';
    src: url('https://assets.parallel.ai/FTSystemMono-Bold.woff2') format('woff2');
    font-weight: 700;
  }
  @font-face {
    font-family: 'Gerstner Programm';
    src: url('https://assets.parallel.ai/Gerstner-ProgrammRegular.woff2') format('woff2');
    font-weight: 400;
  }
  @font-face {
    font-family: 'Gerstner Programm';
    src: url('https://assets.parallel.ai/Gerstner-ProgrammMedium.woff2') format('woff2');
    font-weight: 500;
  }

  :root {
    --off-white: #fcfcfa;
    --index-black: #1d1b16;
    --neural: #d8d0bf;
    --signal: #fb631b;
    --code-bg: #1d1b16;
    --code-text: #fcfcfa;
    --code-header-bg: #2d2d2d;
    --muted: #666;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --off-white: #1a1a1a;
      --index-black: #f0f0f0;
      --neural: #333;
      --signal: #ff7a3d;
      --code-bg: #0d0d0d;
      --code-text: #e0e0e0;
      --code-header-bg: #252525;
      --muted: #999;
    }
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Gerstner Programm', -apple-system, BlinkMacSystemFont, sans-serif;
    background: var(--off-white);
    color: var(--index-black);
  }

  .mono { font-family: 'FT System Mono', monospace; }

  .container {
    max-width: 900px;
    margin: 0 auto;
    padding: 2rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid var(--neural);
    background: var(--off-white);
  }

  .logo {
    font-family: 'FT System Mono', monospace;
    font-weight: 700;
    font-size: 1.25rem;
    color: var(--index-black);
    text-decoration: none;
  }

  .btn {
    font-family: 'FT System Mono', monospace;
    padding: 0.75rem 1.5rem;
    border: 2px solid var(--index-black);
    background: transparent;
    color: var(--index-black);
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-block;
  }

  .btn:hover {
    background: var(--index-black);
    color: var(--off-white);
  }

  .btn-primary {
    background: var(--signal);
    border-color: var(--signal);
    color: var(--off-white);
  }

  .btn-primary:hover {
    background: #e55a18;
    border-color: #e55a18;
  }

  .btn-danger {
    border-color: #dc2626;
    color: #dc2626;
  }

  .btn-danger:hover {
    background: #dc2626;
    color: var(--off-white);
  }

  .card {
    background: var(--off-white);
    border: 1px solid var(--neural);
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .card-title {
    font-family: 'FT System Mono', monospace;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--signal);
    margin-bottom: 1rem;
  }

  input[type="text"], input[type="password"], input[type="url"], textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid var(--neural);
    background: var(--off-white);
    font-family: 'FT System Mono', monospace;
    font-size: 0.875rem;
    margin-bottom: 1rem;
  }

  input:focus, textarea:focus {
    outline: 2px solid var(--signal);
    border-color: transparent;
  }

  textarea {
    resize: vertical;
    min-height: 100px;
  }

  .provider-list {
    list-style: none;
  }

  .provider-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid var(--neural);
  }

  .provider-item:last-child {
    border-bottom: none;
  }

  .provider-url {
    font-family: 'FT System Mono', monospace;
    font-size: 0.875rem;
    word-break: break-all;
  }

  .provider-actions {
    display: flex;
    gap: 0.5rem;
  }

  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(29, 27, 22, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    backdrop-filter: blur(4px);
  }

  .modal {
    background: var(--off-white);
    padding: 2rem;
    max-width: 400px;
    width: 90%;
    text-align: center;
    border: 2px solid var(--index-black);
  }

  .modal h2 {
    font-family: 'FT System Mono', monospace;
    margin-bottom: 1rem;
  }

  .modal p {
    margin-bottom: 1.5rem;
    color: var(--muted);
  }

  .chat-container {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem;
  }

  .message {
    margin-bottom: 1.5rem;
    max-width: 80%;
  }

  .message-user {
    margin-left: auto;
    background: var(--index-black);
    color: var(--off-white);
    padding: 1rem;
  }

  .message-assistant {
    background: var(--neural);
    padding: 1rem;
  }

  .message-content {
    font-size: 0.9375rem;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  .message-content code {
    font-family: 'FT System Mono', monospace;
    background: var(--neural);
    padding: 0.125rem 0.25rem;
    font-size: 0.875rem;
  }

  .message-content pre {
    background: var(--code-bg);
    color: var(--code-text);
    padding: 1rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }

  .message-content pre code {
    background: none;
    padding: 0;
  }

  .message-content h1, .message-content h2, .message-content h3 {
    margin: 1rem 0 0.5rem;
    font-weight: 600;
  }

  .message-content h1 { font-size: 1.5rem; }
  .message-content h2 { font-size: 1.25rem; }
  .message-content h3 { font-size: 1.1rem; }

  .message-content p { margin: 0.5rem 0; }

  .message-content ul, .message-content ol {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }

  .message-content li { margin: 0.25rem 0; }

  .message-content blockquote {
    border-left: 3px solid var(--signal);
    padding-left: 1rem;
    margin: 0.5rem 0;
    color: var(--muted);
  }

  .message-content a {
    color: var(--signal);
    text-decoration: underline;
  }

  .message-content strong { font-weight: 600; }
  .message-content em { font-style: italic; }

  .message-content hr {
    border: none;
    border-top: 1px solid var(--neural);
    margin: 1rem 0;
  }

  .message-content table {
    border-collapse: collapse;
    margin: 0.5rem 0;
    width: 100%;
  }

  .message-content th, .message-content td {
    border: 1px solid var(--neural);
    padding: 0.5rem;
    text-align: left;
  }

  .message-content th {
    background: var(--neural);
    font-weight: 600;
  }

  .code-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--code-header-bg);
    padding: 0.5rem 1rem;
    font-size: 0.75rem;
    color: var(--muted);
  }

  .copy-btn {
    background: transparent;
    border: 1px solid var(--muted);
    color: var(--muted);
    padding: 0.25rem 0.5rem;
    font-size: 0.7rem;
    cursor: pointer;
    font-family: 'FT System Mono', monospace;
  }

  .copy-btn:hover {
    background: var(--neural);
    color: var(--index-black);
  }

  .chat-input-container {
    padding: 1rem;
    border-top: 1px solid var(--neural);
    background: var(--off-white);
  }

  .chat-input-form {
    display: flex;
    gap: 0.5rem;
  }

  .chat-input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid var(--neural);
    font-family: 'Gerstner Programm', sans-serif;
    font-size: 1rem;
    resize: none;
  }

  .chat-input:focus {
    outline: 2px solid var(--signal);
    border-color: transparent;
  }

  .blurred {
    filter: blur(8px);
    pointer-events: none;
  }

  .user-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-family: 'FT System Mono', monospace;
    background: #22c55e;
    color: white;
    margin-left: 0.5rem;
  }

  .status-badge.pending {
    background: var(--signal);
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: var(--muted);
  }
`;

export function baseHtml(title: string, content: string, ogImage?: string): string {
  const ogTags = ogImage
    ? `
    <meta property="og:image" content="${ogImage}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:image" content="${ogImage}">
  `
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>${title}</title>
  ${ogTags}
  <style>${STYLES}</style>
</head>
<body>
  ${content}
</body>
</html>`;
}

export function getApexDomain(url: string): string {
  const hostname = new URL(url).hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

export function getFaviconUrl(url: string, size: number = 64): string {
  const apexDomain = getApexDomain(url);
  return `https://www.google.com/s2/favicons?domain=${apexDomain}&sz=${size}`;
}

export function renderHeader(user?: {
  name: string;
  username: string;
  profile_image_url?: string;
}): string {
  if (user) {
    return `
      <header class="header">
        <a href="/" class="logo">MCP Chat</a>
        <div class="user-info">
          ${user.profile_image_url ? `<img src="${user.profile_image_url}" alt="${user.name}" class="user-avatar">` : ""}
          <span class="mono">@${user.username}</span>
          <a href="/logout" class="btn">Logout</a>
        </div>
      </header>
    `;
  }
  return `
    <header class="header">
      <a href="/" class="logo">MCP Chat</a>
      <a href="/authorize" class="btn btn-primary">Login with X</a>
    </header>
  `;
}
