import { getAuthorizationForUrl } from "../../packages/idp-middleware/idp-middleware";
import { chatCompletionsProxy } from "../../packages/mcp-completions-stateless/mcp-completions-stateless";
import {
  Env,
  UserContext,
  MODEL,
  DEFAULT_SYSTEM_PROMPT,
  baseHtml,
} from "./shared";

function getApexDomain(url: string): string {
  const hostname = new URL(url).hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

function renderChatHeader(
  hostname: string,
  apexDomain: string,
  user?: { name: string; username: string; profile_image_url?: string },
): string {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${apexDomain}&sz=64`;
  const userSection = user
    ? `<div class="user-info">
        ${user.profile_image_url ? `<img src="${user.profile_image_url}" alt="${user.name}" class="user-avatar">` : ""}
        <span class="mono">@${user.username}</span>
        <a href="/logout" class="btn">Logout</a>
      </div>`
    : `<a href="/authorize" class="btn btn-primary">Login with X</a>`;

  return `
    <header class="header">
      <a href="/" class="logo" style="display: flex; align-items: center; gap: 0.5rem;">
        <img src="${faviconUrl}" width="24" height="24" style="border-radius: 4px;" />
        ${hostname}
      </a>
      ${userSection}
    </header>
  `;
}

export async function handleChatCompletions(
  request: Request,
  env: Env,
  ctx: UserContext,
): Promise<Response> {
  if (!ctx.authenticated || !ctx.user?.id) {
    return new Response(
      JSON.stringify({
        error: { message: "Unauthorized", type: "auth_error" },
      }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const openaiKey = await env.OPENAI_KEYS.get(ctx.user.id);
  if (!openaiKey) {
    return new Response(
      JSON.stringify({
        error: {
          message: "OpenAI API key not configured",
          type: "config_error",
        },
      }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Get system prompt
  const systemPrompt = await env.OPENAI_KEYS.get(`system_prompt:${ctx.user.id}`);
  const currentSystemPrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  const { fetchProxy } = chatCompletionsProxy({
    clientInfo: { name: "MCP Chat", version: "1.0.0" },
  });

  const body = (await request.json()) as any;
  body.stream = true;
  body.model = MODEL;

  // Prepend system prompt to messages
  if (currentSystemPrompt) {
    body.messages = [
      { role: "system", content: currentSystemPrompt },
      ...(body.messages || []),
    ];
  }

  // Get authorization for MCP tools
  if (body.tools) {
    for (const tool of body.tools) {
      if (tool.type === "mcp" && tool.server_url) {
        const auth = await getAuthorizationForUrl(
          env,
          ctx.user.id,
          tool.server_url,
          {
            baseUrl: new URL(request.url).origin,
            clientInfo: { name: "MCP Chat", uri: new URL(request.url).origin },
          },
        );
        if (auth.Authorization) {
          tool.authorization = auth.Authorization;
        }
      }
    }
  }

  return fetchProxy("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify(body),
  });
}

export async function handleMcpChat(
  request: Request,
  env: Env,
  ctx: UserContext,
  mcpPath: string,
): Promise<Response> {
  const url = new URL(request.url);
  const mcpUrl = `https://${mcpPath}`;
  const hostname = new URL(mcpUrl).hostname;
  const apexDomain = getApexDomain(mcpUrl);
  const ogImageUrl = `${url.origin}/og/${mcpPath}`;

  const chatInterface = `
    <style>
      body { height: 100vh; overflow: hidden; }
      .message-content p { margin: 0.25rem 0; }
      .message-content h1, .message-content h2, .message-content h3 { margin: 0.5rem 0 0.25rem; }
      .message-content ul, .message-content ol { margin: 0; padding-left: 1.1rem; }
      .message-content li { margin: 0; line-height: 1.4; }
      .message-content li ul, .message-content li ol { margin: 0; padding-left: 1rem; }
      .message-content pre { margin: 0.25rem 0; }
      .message-content blockquote { margin: 0.25rem 0; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <div class="chat-container" id="chat-container">
      <div class="chat-messages" id="chat-messages"></div>
      <div class="chat-input-container">
        <form class="chat-input-form" id="chat-form">
          <textarea class="chat-input" id="chat-input" placeholder="Send a message..." rows="1"></textarea>
          <button type="submit" class="btn btn-primary">Send</button>
        </form>
      </div>
    </div>
    <script>
      const mcpUrl = ${JSON.stringify(mcpUrl)};
      const messages = [];
      const chatMessages = document.getElementById('chat-messages');
      const chatForm = document.getElementById('chat-form');
      const chatInput = document.getElementById('chat-input');

      // Configure marked for security and code blocks
      marked.setOptions({
        breaks: true,
        gfm: true,
      });

      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }

      function renderMarkdown(content) {
        try {
          let html = marked.parse(content);
          // Add copy buttons to code blocks
          html = html.replace(/<pre><code(\\s+class="language-([^"]*)")?>/g, (match, classAttr, lang) => {
            const langLabel = lang || 'code';
            return '<div class="code-block-wrapper"><div class="code-header"><span>' + escapeHtml(langLabel) + '</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><pre><code' + (classAttr || '') + '>';
          });
          html = html.replace(/<\\/code><\\/pre>/g, '</code></pre></div>');
          return html;
        } catch (e) {
          return escapeHtml(content);
        }
      }

      window.copyCode = function(btn) {
        const wrapper = btn.closest('.code-block-wrapper');
        const code = wrapper.querySelector('code').textContent;
        navigator.clipboard.writeText(code).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
      };

      function renderMessage(role, content, isStreaming = false) {
        const div = document.createElement('div');
        div.className = 'message message-' + role;
        if (role === 'user') {
          div.innerHTML = '<div class="message-content">' + escapeHtml(content) + '</div>';
        } else {
          div.innerHTML = '<div class="message-content">' + (isStreaming ? escapeHtml(content) : renderMarkdown(content)) + '</div>';
        }
        chatMessages.appendChild(div);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return div;
      }

      chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const content = chatInput.value.trim();
        if (!content) return;

        chatInput.value = '';
        messages.push({ role: 'user', content });
        renderMessage('user', content);

        const assistantDiv = renderMessage('assistant', '', true);
        const contentDiv = assistantDiv.querySelector('.message-content');

        try {
          const response = await fetch('/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messages,
              tools: [{ type: 'mcp', server_url: mcpUrl, require_approval: 'never' }],
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            contentDiv.textContent = 'Error: ' + (error.error?.message || 'Unknown error');
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullContent = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
              try {
                const data = JSON.parse(line.slice(6));
                const delta = data.choices?.[0]?.delta?.content;
                if (delta) {
                  fullContent += delta;
                  // Show raw text while streaming for performance
                  contentDiv.textContent = fullContent;
                  chatMessages.scrollTop = chatMessages.scrollHeight;
                }
              } catch {}
            }
          }

          // Render final markdown after streaming completes
          contentDiv.innerHTML = renderMarkdown(fullContent);
          chatMessages.scrollTop = chatMessages.scrollHeight;

          messages.push({ role: 'assistant', content: fullContent });
        } catch (error) {
          contentDiv.textContent = 'Error: ' + error.message;
        }
      });

      chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          chatForm.dispatchEvent(new Event('submit'));
        }
      });
    </script>
  `;

  if (!ctx.authenticated) {
    const content = `
      ${renderChatHeader(hostname, apexDomain)}
      <div class="blurred">
        ${chatInterface}
      </div>
      <div class="modal-overlay">
        <div class="modal">
          <h2>Login Required</h2>
          <p>Login with X to chat with ${hostname}</p>
          <a href="/authorize" class="btn btn-primary">Login with X</a>
        </div>
      </div>
    `;
    return new Response(
      baseHtml(`Chat with ${hostname}`, content, ogImageUrl),
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  const openaiKey = await env.OPENAI_KEYS.get(ctx.user!.id);
  if (!openaiKey) {
    const content = `
      ${renderChatHeader(hostname, apexDomain, ctx.user)}
      <div class="blurred">
        ${chatInterface}
      </div>
      <div class="modal-overlay">
        <div class="modal">
          <h2>API Key Required</h2>
          <p>Provide an OpenAI API key to start chatting</p>
          <a href="/" class="btn btn-primary">Configure API Key</a>
        </div>
      </div>
    `;
    return new Response(
      baseHtml(`Chat with ${hostname}`, content, ogImageUrl),
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  // Check if MCP is authorized
  const auth = await getAuthorizationForUrl(env, ctx.user!.id, mcpUrl, {
    baseUrl: url.origin,
    clientInfo: { name: "MCP Chat", uri: url.origin },
  });

  if (auth.loginUrl) {
    const content = `
      ${renderChatHeader(hostname, apexDomain, ctx.user)}
      <div class="blurred">
        ${chatInterface}
      </div>
      <div class="modal-overlay">
        <div class="modal">
          <h2>Authorization Required</h2>
          <p>Login to ${hostname} to start chat</p>
          <a href="${auth.loginUrl}" target="_blank" class="btn btn-primary">Login to ${hostname}</a>
        </div>
      </div>
    `;
    return new Response(
      baseHtml(`Chat with ${hostname}`, content, ogImageUrl),
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  // All good, show the chat interface
  const content = `
    ${renderChatHeader(hostname, apexDomain, ctx.user)}
    ${chatInterface}
  `;

  return new Response(baseHtml(`Chat with ${hostname}`, content, ogImageUrl), {
    headers: { "Content-Type": "text/html" },
  });
}
