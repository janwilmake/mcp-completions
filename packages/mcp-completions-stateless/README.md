# MCP Completions (Stateless)

Add MCP tool calling to any OpenAI-compatible LLM via a stateless fetch proxy.

## Quick Start

```ts
import { chatCompletionsProxy } from "mcp-completions-stateless";
import { OpenAI } from "openai";

const { fetchProxy } = chatCompletionsProxy({
  clientInfo: { name: "My App", version: "1.0.0" },
});

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  fetch: fetchProxy,
});

const stream = await client.chat.completions.create({
  model: "gpt-4o",
  stream: true,
  stream_options: { include_usage: true },
  messages: [{ role: "user", content: "What tools do you have?" }],
  tools: [
    {
      type: "mcp",
      server_url: "https://mcp.notion.com/mcp",
      authorization: "Bearer YOUR_TOKEN", // Optional: add if server requires auth
    },
    { type: "url_context", max_urls: 10 },
  ],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

## Features

- **MCP Tools**: Discover and execute tools from any MCP server
- **URL Context**: Fetch content from URLs in messages
- **Shadow URLs**: Replace hostnames for better access (e.g., `github.com` → `uithub.com`)
- **Extract Fallback**: Convert HTML/PDF via configurable extract service
- **Cost Tracking**: Track additional costs in usage stats
- **Stateless**: No Durable Objects or OAuth required - fully local/stateless

## Configuration

```ts
chatCompletionsProxy({
  clientInfo: { name: "App", version: "1.0.0" },

  // Optional: Replace hostnames for better content access
  shadowUrls: {
    "github.com": "uithub.com",
    "x.com": "xymake.com",
  },

  // Optional: Extract service for HTML/PDF
  extractUrl: {
    url: "https://extract.example.com",
    bearerToken: "your-api-key",
  },
});
```

## Tool Types

### MCP Server

```ts
{
  type: "mcp",
  server_url: "https://mcp.notion.com/mcp",
  authorization: "Bearer YOUR_TOKEN", // Optional
  allowed_tools: { tool_names: ["specific_tool"] }, // Optional
  require_approval: "never"
}
```

### URL Context

```ts
{
  type: "url_context",
  max_urls: 10,
  max_context_length: 1048576
}
```

## How It Works

1. Request with MCP tools hits the proxy
2. Proxy discovers tools from MCP servers using provided authorization
3. Translates MCP tools to OpenAI functions
4. Executes tool calls and streams results back
5. All state is ephemeral - sessions are cached in memory during the request

## Differences from Full Version

This stateless version removes:

- OAuth/IDP middleware and Durable Objects dependency
- Automatic authentication flow
- Persistent token storage

Instead, you provide authorization directly in the tool configuration. This makes it suitable for:

- Local development
- Server-to-server integrations
- Cases where you manage auth separately
