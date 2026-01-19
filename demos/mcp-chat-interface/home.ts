import { createIdpMiddleware } from "../../packages/idp-middleware/idp-middleware";
import {
  Env,
  UserContext,
  DEFAULT_SYSTEM_PROMPT,
  baseHtml,
  renderHeader,
} from "./shared";

export async function handleConfig(
  request: Request,
  env: Env,
  ctx: UserContext,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = ctx.user?.id;

  if (!ctx.authenticated || !userId) {
    return new Response(
      baseHtml(
        "MCP Chat - Login Required",
        `
      ${renderHeader()}
      <div class="container">
        <div class="card">
          <h1 style="margin-bottom: 1rem;">Welcome to MCP Chat</h1>
          <p style="margin-bottom: 1.5rem;">Connect to any MCP server and chat with AI-powered tools.</p>
          <a href="/authorize" class="btn btn-primary">Login with X to get started</a>
        </div>
      </div>
    `,
      ),
      { headers: { "Content-Type": "text/html" } },
    );
  }

  const idpHandler = createIdpMiddleware(
    {
      userId,
      baseUrl: url.origin,
      clientInfo: { name: "MCP Chat", version: "1.0.0", uri: url.origin },
    },
    env,
  );

  // Handle actions via query params
  const action = url.searchParams.get("action");

  if (action === "save-key" && request.method === "GET") {
    const key = url.searchParams.get("key");
    if (key) {
      await env.OPENAI_KEYS.put(userId, key);
      return Response.redirect(url.origin + "/?saved=1", 302);
    }
  }

  if (action === "remove-key") {
    await env.OPENAI_KEYS.delete(userId);
    return Response.redirect(url.origin + "/?removed=1", 302);
  }

  if (action === "save-system-prompt" && request.method === "POST") {
    const formData = await request.formData();
    const systemPrompt = formData.get("system_prompt")?.toString() || "";
    await env.OPENAI_KEYS.put(`system_prompt:${userId}`, systemPrompt);
    return Response.redirect(url.origin + "/?prompt_saved=1", 302);
  }

  if (action === "reset-system-prompt") {
    await env.OPENAI_KEYS.delete(`system_prompt:${userId}`);
    return Response.redirect(url.origin + "/?prompt_reset=1", 302);
  }

  if (action === "remove-provider") {
    const providerUrl = url.searchParams.get("url");
    if (providerUrl && idpHandler) {
      await idpHandler.removeProvider(providerUrl);
    }
    return Response.redirect(url.origin + "/", 302);
  }

  const openaiKey = await env.OPENAI_KEYS.get(userId);
  const systemPrompt = await env.OPENAI_KEYS.get(`system_prompt:${userId}`);
  const currentPrompt = systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const providers = idpHandler ? await idpHandler.getProviders() : [];

  const providersList =
    providers.length > 0
      ? `<ul class="provider-list">
        ${providers
          .map(
            (p) => `
          <li class="provider-item">
            <div>
              <span class="provider-url">${p.resource_url}</span>
              ${p.access_token ? '<span class="status-badge">Connected</span>' : '<span class="status-badge pending">Pending</span>'}
            </div>
            <div class="provider-actions">
              <a href="/${p.resource_url.replace(/^https?:\/\//, "")}" class="btn">Open</a>
              <a href="/?action=remove-provider&url=${encodeURIComponent(p.resource_url)}" class="btn btn-danger">Remove</a>
            </div>
          </li>
        `,
          )
          .join("")}
      </ul>`
      : '<div class="empty-state">No MCP servers connected yet</div>';

  const content = `
    ${renderHeader(ctx.user)}
    <div class="container">
      <h1 style="margin-bottom: 2rem;">Configuration</h1>

      <div class="card">
        <div class="card-title">OpenAI API Key</div>
        ${
          openaiKey
            ? `<p style="margin-bottom: 1rem;" class="mono">Key configured: ${openaiKey.slice(0, 8)}...${openaiKey.slice(-4)}</p>
             <a href="/?action=remove-key" class="btn btn-danger">Remove Key</a>`
            : `<form action="/" method="get">
              <input type="hidden" name="action" value="save-key">
              <input type="password" name="key" placeholder="sk-..." required>
              <button type="submit" class="btn btn-primary">Save API Key</button>
            </form>`
        }
      </div>

      <div class="card">
        <div class="card-title">System Prompt</div>
        <form action="/?action=save-system-prompt" method="post">
          <textarea name="system_prompt" rows="8" placeholder="Enter a system prompt...">${currentPrompt.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</textarea>
          <div style="display: flex; gap: 0.5rem;">
            <button type="submit" class="btn btn-primary">Save System Prompt</button>
            ${systemPrompt !== null ? `<a href="/?action=reset-system-prompt" class="btn">Reset to Default</a>` : ""}
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-title">Connected MCP Servers</div>
        ${providersList}
      </div>

      <div class="card">
        <div class="card-title">Add MCP Server</div>
        <form action="/" method="get" onsubmit="event.preventDefault(); const url = this.querySelector('input').value.replace(/^https?:\\/\\//, ''); window.location.href = '/' + url;">
          <input type="url" name="mcp_url" placeholder="https://mcp.example.com" required>
          <button type="submit" class="btn btn-primary">Connect</button>
        </form>
      </div>
    </div>
  `;

  return new Response(baseHtml("MCP Chat - Configuration", content), {
    headers: { "Content-Type": "text/html" },
  });
}
