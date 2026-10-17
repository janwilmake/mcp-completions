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
  ],
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

## Features

- **MCP Tools**: Discover and execute tools from any MCP server
- **Cost Tracking**: Track token usage in completion stats
- **Stateless**: No Durable Objects or OAuth required - fully local/stateless

## Configuration

```ts
chatCompletionsProxy({
  clientInfo: { name: "App", version: "1.0.0" },
});
```

## Tool Configuration

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

### Parallel web search and page fetching

[Parallel Search MCP](https://docs.parallel.ai/integrations/mcp/search-mcp) provides
free web search and page fetching without a Parallel account or API key. Anonymous
searches use Fast mode and have lower rate limits than authenticated requests.

To use it with the Quick Start above, replace the `tools` array with:

```ts
tools: [
  {
    type: "mcp",
    server_url: "https://search.parallel.ai/mcp",
    allowed_tools: { tool_names: ["web_search", "web_fetch"] },
    require_approval: "never",
  },
],
```

Then change the user message to a research task, for example: "Search for the
latest Model Context Protocol release, fetch the release notes, and summarize the
changes with source links." The proxy discovers `web_search` and `web_fetch`,
exposes them as functions to the model, and executes the model's tool calls.
Your LLM provider's credentials are still required, as in the Quick Start.

Leave `authorization` out for anonymous access. For higher limits, set it to
`"Bearer " + process.env.PARALLEL_API_KEY` with a key from
[Parallel](https://platform.parallel.ai). This Search MCP endpoint is separate
from the authenticated `https://task-mcp.parallel.ai/mcp` endpoint in the stateless
demos, which runs research tasks. Page fetching here uses the MCP `web_fetch`
tool; it does not require `url_context`, which this stateless package omits.

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
- URL context extraction functionality

Instead, you provide authorization directly in the tool configuration. This makes it suitable for:

- Local development
- Server-to-server integrations
- Cases where you manage auth separately
