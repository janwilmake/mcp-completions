/// <reference types="@cloudflare/workers-types" />
import { withSimplerAuth } from "simplerauth-client";
import { chatCompletionsProxy } from "../../packages/mcp-completions-stateless/mcp-completions-stateless";
import {
  createIdpMiddleware,
  OAuthProviders,
  getAuthorizationForUrl,
  type IdpMiddlewareEnv,
} from "../../packages/idp-middleware/idp-middleware";
import { ImageResponse } from "workers-og";

export { OAuthProviders };

interface Env extends IdpMiddlewareEnv {
  OPENAI_KEYS: KVNamespace;
}

interface UserContext extends ExecutionContext {
  user?: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
  accessToken?: string;
  authenticated: boolean;
}

const { fetchProxy } = chatCompletionsProxy({
  clientInfo: { name: "MCP Chat Interface", version: "1.0.0" },
});

async function getOpenAIKey(env: Env, userId: string): Promise<string | null> {
  return await env.OPENAI_KEYS.get(`openai_key:${userId}`);
}

async function setOpenAIKey(
  env: Env,
  userId: string,
  apiKey: string,
): Promise<void> {
  await env.OPENAI_KEYS.put(`openai_key:${userId}`, apiKey);
}

async function deleteOpenAIKey(env: Env, userId: string): Promise<void> {
  await env.OPENAI_KEYS.delete(`openai_key:${userId}`);
}

async function discoverMCPMetadata(
  mcpUrl: string,
  authorization?: string,
): Promise<{
  name: string;
  description?: string;
  version?: string;
  vendor?: string;
  icon?: string;
}> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json,text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    };

    if (authorization) {
      headers.Authorization = authorization;
    }

    const response = await fetch(mcpUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "MCP Chat Interface", version: "1.0.0" },
        },
      }),
    });

    if (!response.ok) {
      const hostname = new URL(mcpUrl).hostname;
      return { name: hostname };
    }

    const result = await response.json();
    const serverInfo = result.result?.serverInfo || {};

    return {
      name: serverInfo.name || new URL(mcpUrl).hostname,
      description: serverInfo.description,
      version: serverInfo.version,
      vendor: serverInfo.vendor,
      icon: serverInfo.icon,
    };
  } catch (error) {
    const hostname = new URL(mcpUrl).hostname;
    return { name: hostname };
  }
}

function renderHomePage(
  user: UserContext["user"],
  hasOpenAIKey: boolean,
  providers: Array<any>,
  baseUrl: string,
): string {
  const providersList = providers
    .map(
      (p) => `
    <div class="provider-card">
      <div class="provider-info">
        <h3>${p.name}</h3>
        <p>${p.resource_url}</p>
        ${p.metadata?.description ? `<p class="description">${p.metadata.description}</p>` : ""}
      </div>
      <div class="provider-actions">
        <a href="${baseUrl}/${p.resource_url.replace(/^https?:\/\//, "")}" class="btn btn-primary">Open</a>
        <form method="GET" style="display: inline;">
          <input type="hidden" name="action" value="remove_idp">
          <input type="hidden" name="url" value="${p.resource_url}">
          <button type="submit" class="btn btn-danger">Remove</button>
        </form>
      </div>
    </div>
  `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Chat Interface - Configuration</title>
  <style>
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
      font-family: 'Gerstner Programm';
      src: url('https://assets.parallel.ai/Gerstner-ProgrammRegular.woff2') format('woff2');
      font-weight: 400;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Gerstner Programm', -apple-system, sans-serif;
      background: #fcfcfa;
      color: #1d1b16;
      padding: 40px 20px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 {
      font-family: 'FT System Mono', monospace;
      font-size: 32px;
      margin-bottom: 10px;
      color: #fb631b;
    }
    h2 {
      font-family: 'FT System Mono', monospace;
      font-size: 24px;
      margin: 30px 0 15px;
      color: #1d1b16;
    }
    .user-info {
      background: #fff;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      border: 1px solid #d8d0bf;
    }
    .user-info img {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      vertical-align: middle;
      margin-right: 15px;
    }
    .section {
      background: #fff;
      padding: 25px;
      border-radius: 8px;
      margin-bottom: 20px;
      border: 1px solid #d8d0bf;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      font-family: 'FT System Mono', monospace;
      font-size: 14px;
      margin-bottom: 8px;
      color: #1d1b16;
    }
    input[type="text"], input[type="password"], input[type="url"] {
      width: 100%;
      padding: 12px;
      border: 1px solid #d8d0bf;
      border-radius: 4px;
      font-family: 'FT System Mono', monospace;
      font-size: 14px;
      background: #fcfcfa;
    }
    input:focus {
      outline: none;
      border-color: #fb631b;
    }
    .btn {
      font-family: 'FT System Mono', monospace;
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      text-decoration: none;
      display: inline-block;
      margin-right: 10px;
    }
    .btn-primary {
      background: #fb631b;
      color: #fcfcfa;
    }
    .btn-primary:hover {
      background: #e55a18;
    }
    .btn-secondary {
      background: #d8d0bf;
      color: #1d1b16;
    }
    .btn-danger {
      background: #ff4444;
      color: #fff;
    }
    .provider-card {
      background: #fcfcfa;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 15px;
      border: 1px solid #d8d0bf;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .provider-info h3 {
      font-family: 'FT System Mono', monospace;
      font-size: 16px;
      margin-bottom: 5px;
    }
    .provider-info p {
      font-size: 14px;
      color: #666;
      font-family: 'FT System Mono', monospace;
    }
    .provider-info .description {
      margin-top: 5px;
      font-family: 'Gerstner Programm', sans-serif;
    }
    .provider-actions {
      display: flex;
      gap: 10px;
    }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 4px;
      font-family: 'FT System Mono', monospace;
      font-size: 12px;
      margin-left: 10px;
    }
    .status.configured {
      background: #d8f5d8;
      color: #1d6b1d;
    }
    .status.not-configured {
      background: #ffe5e5;
      color: #8b0000;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MCP Chat Interface</h1>
    
    ${
      user
        ? `
    <div class="user-info">
      <img src="${user.profile_image_url || "https://assets.parallel.ai/dark-parallel-avatar-270.png"}" alt="${user.name}">
      <strong>${user.name}</strong> (@${user.username})
    </div>
    
    <div class="section">
      <h2>OpenAI API Key 
        <span class="status ${hasOpenAIKey ? "configured" : "not-configured"}">
          ${hasOpenAIKey ? "Configured" : "Not Configured"}
        </span>
      </h2>
      <form method="GET">
        <div class="form-group">
          <label>API Key</label>
          <input type="password" name="openai_key" placeholder="${hasOpenAIKey ? "••••••••••••••••" : "sk-..."}" ${hasOpenAIKey ? "" : "required"}>
        </div>
        <input type="hidden" name="action" value="set_openai_key">
        <button type="submit" class="btn btn-primary">${hasOpenAIKey ? "Update" : "Save"} API Key</button>
        ${hasOpenAIKey ? '<button type="submit" formaction="?action=delete_openai_key" class="btn btn-danger">Delete</button>' : ""}
      </form>
    </div>
    
    <div class="section">
      <h2>Add MCP Server</h2>
      <form method="GET">
        <div class="form-group">
          <label>MCP Server URL</label>
          <input type="url" name="mcp_url" placeholder="https://mcp.example.com/mcp" required>
        </div>
        <input type="hidden" name="action" value="add_idp">
        <button type="submit" class="btn btn-primary">Add MCP Server</button>
      </form>
    </div>
    
    <div class="section">
      <h2>Configured MCP Servers (${providers.length})</h2>
      ${providers.length > 0 ? providersList : "<p>No MCP servers configured yet.</p>"}
    </div>
    `
        : `
    <div class="section">
      <h2>Welcome to MCP Chat Interface</h2>
      <p style="margin-bottom: 20px;">Login with X to start chatting with MCP servers.</p>
      <a href="/authorize" class="btn btn-primary">Login with X</a>
    </div>
    `
    }
  </div>
</body>
</html>`;
}

function renderChatInterface(
  mcpUrl: string,
  mcpName: string,
  mcpDescription: string | undefined,
  user: UserContext["user"],
  isAuthorized: boolean,
  baseUrl: string,
): string {
  const blurred = !user || !isAuthorized;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chat with ${mcpName}</title>
  <meta property="og:title" content="Chat with ${mcpName}">
  <meta property="og:description" content="${mcpDescription || `Interactive chat interface for ${mcpName}`}">
  <meta property="og:image" content="${baseUrl}/og/${mcpUrl.replace(/^https?:\/\//, "")}">
  <meta property="og:type" content="website">
  <style>
    @font-face {
      font-family: 'FT System Mono';
      src: url('https://assets.parallel.ai/FTSystemMono-Regular.woff2') format('woff2');
      font-weight: 400;
    }
    @font-face {
      font-family: 'Gerstner Programm';
      src: url('https://assets.parallel.ai/Gerstner-ProgrammRegular.woff2') format('woff2');
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Gerstner Programm', -apple-system, sans-serif;
      background: #fcfcfa;
      color: #1d1b16;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    
    ${
      blurred
        ? `
    .blur-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(252, 252, 250, 0.95);
      backdrop-filter: blur(10px);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .modal {
      background: #fff;
      padding: 40px;
      border-radius: 12px;
      border: 2px solid #fb631b;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.1);
    }
    .modal h2 {
      font-family: 'FT System Mono', monospace;
      font-size: 28px;
      margin-bottom: 15px;
      color: #fb631b;
    }
    .modal p {
      margin-bottom: 25px;
      font-size: 16px;
      line-height: 1.5;
    }
    .btn {
      font-family: 'FT System Mono', monospace;
      padding: 14px 28px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      text-decoration: none;
      display: inline-block;
      background: #fb631b;
      color: #fcfcfa;
    }
    .btn:hover {
      background: #e55a18;
    }
    `
        : ""
    }
    
    header {
      background: #fff;
      border-bottom: 1px solid #d8d0bf;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    header h1 {
      font-family: 'FT System Mono', monospace;
      font-size: 20px;
      color: #fb631b;
    }
    header a {
      font-family: 'FT System Mono', monospace;
      font-size: 14px;
      color: #1d1b16;
      text-decoration: none;
    }
    
    #chat-container {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }
    
    .message {
      padding: 15px 20px;
      border-radius: 8px;
      max-width: 80%;
      word-wrap: break-word;
    }
    .message.user {
      align-self: flex-end;
      background: #fb631b;
      color: #fcfcfa;
      font-family: 'FT System Mono', monospace;
    }
    .message.assistant {
      align-self: flex-start;
      background: #fff;
      border: 1px solid #d8d0bf;
      font-family: 'Gerstner Programm', sans-serif;
    }
    .message.assistant pre {
      background: #fcfcfa;
      padding: 10px;
      border-radius: 4px;
      overflow-x: auto;
      margin: 10px 0;
    }
    
    #input-container {
      background: #fff;
      border-top: 1px solid #d8d0bf;
      padding: 20px;
      display: flex;
      gap: 10px;
    }
    #message-input {
      flex: 1;
      padding: 12px;
      border: 1px solid #d8d0bf;
      border-radius: 6px;
      font-family: 'FT System Mono', monospace;
      font-size: 14px;
      background: #fcfcfa;
    }
    #message-input:focus {
      outline: none;
      border-color: #fb631b;
    }
    #send-button {
      font-family: 'FT System Mono', monospace;
      padding: 12px 28px;
      background: #fb631b;
      color: #fcfcfa;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    #send-button:hover:not(:disabled) {
      background: #e55a18;
    }
    #send-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  ${
    blurred
      ? `
  <div class="blur-overlay">
    <div class="modal">
      <h2>${!user ? "Login Required" : `Login to ${mcpName}`}</h2>
      <p>${!user ? `Login with X to chat with ${mcpName}` : `Click below to authorize access to ${mcpName}`}</p>
      <a href="${!user ? "/authorize" : `/oauth/login?url=${encodeURIComponent(mcpUrl)}`}" class="btn">
        ${!user ? "Login with X" : `Connect ${mcpName}`}
      </a>
    </div>
  </div>
  `
      : ""
  }
  
  <header>
    <h1>Chat with ${mcpName}</h1>
    <a href="/">← Back to Config</a>
  </header>
  
  <div id="chat-container"></div>
  
  <div id="input-container">
    <input type="text" id="message-input" placeholder="Type your message..." ${blurred ? "disabled" : ""}>
    <button id="send-button" ${blurred ? "disabled" : ""}>Send</button>
  </div>
  
  <script>
    const chatContainer = document.getElementById('chat-container');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messages = [];
    
    function addMessage(role, content) {
      messages.push({ role, content });
      const messageDiv = document.createElement('div');
      messageDiv.className = \`message \${role}\`;
      
      // Simple markdown rendering for code blocks
      const rendered = content.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
      messageDiv.innerHTML = rendered;
      
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
    
    async function sendMessage() {
      const content = messageInput.value.trim();
      if (!content) return;
      
      addMessage('user', content);
      messageInput.value = '';
      sendButton.disabled = true;
      
      try {
        const response = await fetch('/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o-2024-11-20',
            messages: [...messages],
            stream: true,
            tools: [
              {
                type: 'mcp',
                server_url: '${mcpUrl}',
                require_approval: 'never'
              }
            ]
          })
        });
        
        if (!response.ok) {
          throw new Error('Request failed');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantMessage = '';
        let messageDiv = null;
        
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
              const delta = data.choices[0]?.delta;
              
              if (delta?.content) {
                assistantMessage += delta.content;
                
                if (!messageDiv) {
                  messageDiv = document.createElement('div');
                  messageDiv.className = 'message assistant';
                  chatContainer.appendChild(messageDiv);
                }
                
                const rendered = assistantMessage.replace(/\`\`\`(\\w+)?\\n([\\s\\S]*?)\`\`\`/g, '<pre><code>$2</code></pre>');
                messageDiv.innerHTML = rendered;
                chatContainer.scrollTop = chatContainer.scrollHeight;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
        
        messages.push({ role: 'assistant', content: assistantMessage });
      } catch (error) {
        addMessage('assistant', 'Sorry, an error occurred: ' + error.message);
      } finally {
        sendButton.disabled = false;
        messageInput.focus();
      }
    }
    
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>`;
}

async function renderOGImage(
  mcpUrl: string,
  mcpMetadata: any,
): Promise<Response> {
  const html = `<div
    style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; background-color: #fcfcfa; margin: 0; display: flex;">
    <div class="card"
        style="background-color: white; box-shadow: 0 8px 12px rgba(0, 0, 0, 0.1); overflow: hidden; width: 1200px; height: 630px; display: flex; flex-direction: column;">
        <div class="content" style="flex-grow: 1; display: flex; align-items: center;">
            <div class="header" style="padding: 40px; display: flex; align-items: center; flex-grow: 1;">
                <div class="title-container" style="flex-grow: 1; display: flex; flex-direction: column;">
                    <div class="title"
                        style="font-size: 56px; font-weight: bold; margin-bottom: 20px; display: flex; color: #fb631b;">
                        ${mcpMetadata.name}
                    </div>
                    <div class="subtitle" style="display: flex; font-size: 32px; color: #666;">
                        ${mcpMetadata.description || "MCP Chat Interface"}
                    </div>
                </div>
                ${mcpMetadata.icon ? `<img width="160" height="160" src="${mcpMetadata.icon}" alt="Icon" style="width: 160px; height: 160px; border-radius: 20px; margin-left: 40px;">` : ""}
            </div>
        </div>
        <div class="stats"
            style="display: flex; justify-content: space-around; padding: 30px 0 60px 0; background-color: #fb631b; border-top: 2px solid #eee;">
            <div class="stat" style="text-align: center; display: flex; flex-direction: column;">
                <div class="stat-value"
                    style="color:#fff; display: flex; font-weight: bold; font-size: 36px; justify-content: center;">
                    ${mcpMetadata.version || "1.0.0"}
                </div>
                <div class="stat-label" style="display: flex; font-size: 24px; color: #fff; justify-content: center;">
                    Version
                </div>
            </div>
            <div class="stat" style="text-align: center; display: flex; flex-direction: column;">
                <div class="stat-value"
                    style="color:#fff; display: flex; font-weight: bold; font-size: 36px; justify-content: center;">
                    MCP
                </div>
                <div class="stat-label" style="display: flex; font-size: 24px; color: #fff; justify-content: center;">
                    Protocol
                </div>
            </div>
            ${
              mcpMetadata.vendor
                ? `
            <div class="stat" style="text-align: center; display: flex; flex-direction: column;">
                <div class="stat-value"
                    style="color:#fff; display: flex; font-weight: bold; font-size: 32px; justify-content: center;">
                    ${mcpMetadata.vendor}
                </div>
                <div class="stat-label" style="display: flex; font-size: 24px; color: #fff; justify-content: center;">
                    Vendor
                </div>
            </div>
            `
                : ""
            }
        </div>
    </div>
</div>`;

  return new ImageResponse(html, {
    width: 1200,
    height: 630,
    format: "png",
  });
}

const handler = async (
  request: Request,
  env: Env,
  ctx: UserContext,
): Promise<Response> => {
  const url = new URL(request.url);
  const baseUrl = url.origin;

  // Handle IDP middleware OAuth endpoints
  if (ctx.user) {
    const idpHandler = createIdpMiddleware(
      {
        userId: ctx.user.id,
        baseUrl,
        clientInfo: {
          name: "MCP Chat Interface",
          version: "1.0.0",
          uri: baseUrl,
        },
        onAuthSuccess: async (resourceUrl: string, accessToken: string) => {
          const metadata = await discoverMCPMetadata(
            resourceUrl,
            `Bearer ${accessToken}`,
          );
          return {
            name: metadata.name,
            metadata,
          };
        },
      },
      env,
    );

    const oauthResponse = await idpHandler?.middleware(request, env, ctx);
    if (oauthResponse) return oauthResponse;
  }

  // Handle chat completions proxy
  if (url.pathname === "/chat/completions" && request.method === "POST") {
    if (!ctx.user) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const openaiKey = await getOpenAIKey(env, ctx.user.id);
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // Parse request to get MCP server URL and add authorization
    const body = await request.json();
    const mcpTool = body.tools?.find((t: any) => t.type === "mcp");

    if (mcpTool) {
      // Get authorization for this MCP server
      const authResult = await getAuthorizationForUrl(
        env,
        ctx.user.id,
        mcpTool.server_url,
        {
          clientInfo: {
            name: "MCP Chat Interface",
            version: "1.0.0",
            uri: baseUrl,
          },
          baseUrl,
        },
      );

      if (authResult.Authorization) {
        mcpTool.authorization = authResult.Authorization;
      }
    }

    // Proxy to OpenAI with user's key
    const openaiRequest = new Request(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    return fetchProxy(openaiRequest);
  }

  // Handle homepage and configuration
  if (url.pathname === "/" && request.method === "GET") {
    const action = url.searchParams.get("action");

    if (ctx.user) {
      const idpHandler = createIdpMiddleware(
        {
          userId: ctx.user.id,
          baseUrl,
          clientInfo: {
            name: "MCP Chat Interface",
            version: "1.0.0",
            uri: baseUrl,
          },
        },
        env,
      );

      // Handle actions
      if (action === "set_openai_key") {
        const key = url.searchParams.get("openai_key");
        if (key) {
          await setOpenAIKey(env, ctx.user.id, key);
          return Response.redirect(baseUrl, 302);
        }
      } else if (action === "delete_openai_key") {
        await deleteOpenAIKey(env, ctx.user.id);
        return Response.redirect(baseUrl, 302);
      } else if (action === "add_idp") {
        const mcpUrl = url.searchParams.get("mcp_url");
        if (mcpUrl) {
          return Response.redirect(
            `${baseUrl}/oauth/login?url=${encodeURIComponent(mcpUrl)}`,
            302,
          );
        }
      } else if (action === "remove_idp") {
        const resourceUrl = url.searchParams.get("url");
        if (resourceUrl && idpHandler) {
          await idpHandler.removeProvider(resourceUrl);
          return Response.redirect(baseUrl, 302);
        }
      }

      const hasOpenAIKey = !!(await getOpenAIKey(env, ctx.user.id));
      const providers = idpHandler ? await idpHandler.getProviders() : [];

      return new Response(
        renderHomePage(ctx.user, hasOpenAIKey, providers, baseUrl),
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    return new Response(renderHomePage(undefined, false, [], baseUrl), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Handle OG image generation
  if (url.pathname.startsWith("/og/")) {
    const mcpUrlPart = url.pathname.slice(4);
    const mcpUrl = mcpUrlPart.startsWith("http")
      ? mcpUrlPart
      : `https://${mcpUrlPart}`;

    const metadata = await discoverMCPMetadata(mcpUrl);
    return renderOGImage(mcpUrl, metadata);
  }

  // Handle MCP chat interface
  if (url.pathname !== "/" && !url.pathname.startsWith("/oauth/")) {
    const mcpUrlPart = url.pathname.slice(1);
    const mcpUrl = mcpUrlPart.startsWith("http")
      ? mcpUrlPart
      : `https://${mcpUrlPart}`;

    const metadata = await discoverMCPMetadata(mcpUrl);
    let isAuthorized = false;

    if (ctx.user) {
      const authResult = await getAuthorizationForUrl(
        env,
        ctx.user.id,
        mcpUrl,
        {
          clientInfo: {
            name: "MCP Chat Interface",
            version: "1.0.0",
            uri: baseUrl,
          },
          baseUrl,
        },
      );

      isAuthorized = !!authResult.Authorization;
    }

    return new Response(
      renderChatInterface(
        mcpUrl,
        metadata.name,
        metadata.description,
        ctx.user,
        isAuthorized,
        baseUrl,
      ),
      {
        headers: { "Content-Type": "text/html" },
      },
    );
  }

  return new Response("Not Found", { status: 404 });
};

export default {
  fetch: withSimplerAuth(handler, {
    isLoginRequired: false,
    oauthProviderHost: "login.wilmake.com",
  }),
};
