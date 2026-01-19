/// <reference types="@cloudflare/workers-types" />

import { withSimplerAuth } from "simplerauth-client";
import { createIdpMiddleware } from "../../packages/idp-middleware/idp-middleware";
import { Env, UserContext, OAuthProviders } from "./shared";
import { handleConfig } from "./home";
import { handleChatCompletions, handleMcpChat } from "./chat";
import { handleOgImage } from "./og";

export { OAuthProviders };

async function handler(
  request: Request,
  env: Env,
  ctx: UserContext,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle IDP middleware for OAuth callbacks
  if (ctx.authenticated && ctx.user?.id) {
    const idpHandler = createIdpMiddleware(
      {
        userId: ctx.user.id,
        baseUrl: url.origin,
        clientInfo: { name: "MCP Chat", version: "1.0.0", uri: url.origin },
      },
      env,
    );

    if (idpHandler) {
      const oauthResponse = await idpHandler.middleware(request, env, ctx);
      if (oauthResponse) return oauthResponse;
    }
  }

  // Routes
  if (path === "/") {
    return handleConfig(request, env, ctx);
  }

  if (path === "/chat/completions" && request.method === "POST") {
    return handleChatCompletions(request, env, ctx);
  }

  if (path.startsWith("/og/")) {
    const mcpPath = path.slice(4);
    if (mcpPath) {
      return handleOgImage(mcpPath);
    }
  }

  // MCP chat interface for any other path
  if (
    path.length > 1 &&
    !path.startsWith("/authorize") &&
    !path.startsWith("/callback") &&
    !path.startsWith("/token") &&
    !path.startsWith("/me") &&
    !path.startsWith("/logout")
  ) {
    // Include query params in mcpPath so MCP URLs can have query strings
    const mcpPath = path.slice(1) + url.search;
    return handleMcpChat(request, env, ctx, mcpPath);
  }

  return new Response("Not Found", { status: 404 });
}

export default {
  fetch: withSimplerAuth(handler, {
    isLoginRequired: false,
    oauthProviderHost: "login.wilmake.com",
  }),
};
