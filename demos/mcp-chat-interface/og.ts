import { ImageResponse } from "workers-og";

async function discoverMcpInfo(
  mcpUrl: string,
): Promise<{ name: string; description: string; tools: number }> {
  try {
    const response = await fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json,text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "MCP Chat Discovery", version: "1.0.0" },
        },
      }),
    });

    if (!response.ok) {
      return {
        name: new URL(mcpUrl).hostname,
        description: "MCP Server",
        tools: 0,
      };
    }

    const contentType = response.headers.get("content-type") || "";
    let initResult: any;

    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
      if (dataLine) {
        initResult = JSON.parse(dataLine.slice(6));
      }
    } else {
      initResult = await response.json();
    }

    const serverInfo = initResult?.result?.serverInfo || {};
    const hostname = new URL(mcpUrl).hostname;

    // Try to get tools list
    const sessionId = response.headers.get("Mcp-Session-Id");
    const toolsHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json,text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    };
    if (sessionId) toolsHeaders["Mcp-Session-Id"] = sessionId;

    const toolsResponse = await fetch(mcpUrl, {
      method: "POST",
      headers: toolsHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now() + 1,
        method: "tools/list",
      }),
    });

    let toolsCount = 0;
    if (toolsResponse.ok) {
      const toolsContentType = toolsResponse.headers.get("content-type") || "";
      let toolsResult: any;

      if (toolsContentType.includes("text/event-stream")) {
        const text = await toolsResponse.text();
        const dataLine = text.split("\n").find((l) => l.startsWith("data: "));
        if (dataLine) {
          toolsResult = JSON.parse(dataLine.slice(6));
        }
      } else {
        toolsResult = await toolsResponse.json();
      }

      toolsCount = toolsResult?.result?.tools?.length || 0;
    }

    return {
      name: serverInfo.name || hostname,
      description: serverInfo.description || `MCP Server at ${hostname}`,
      tools: toolsCount,
    };
  } catch (e) {
    const hostname = new URL(mcpUrl).hostname;
    return { name: hostname, description: "MCP Server", tools: 0 };
  }
}

function getApexDomain(url: string): string {
  const hostname = new URL(url).hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join(".");
}

export async function handleOgImage(mcpPath: string): Promise<Response> {
  const mcpUrl = `https://${mcpPath}`;
  const info = await discoverMcpInfo(mcpUrl);
  const apexDomain = getApexDomain(mcpUrl);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${apexDomain}&sz=128`;

  const og = `<div
    style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #fcfcfa; margin: 0; display: flex;">
    <div style="width: 1200px; height: 630px; display: flex; flex-direction: column; border: 4px solid #1d1b16;">
      <div style="flex-grow: 1; display: flex; align-items: center; padding: 60px;">
        <div style="flex-grow: 1; display: flex; flex-direction: column;">
          <div style="font-size: 24px; color: #fb631b; margin-bottom: 20px; display: flex; font-weight: 500;">MCP SERVER</div>
          <div style="font-size: 56px; font-weight: bold; margin-bottom: 24px; display: flex; align-items: center; gap: 24px; color: #1d1b16;">
            <img src="${faviconUrl}" width="64" height="64" style="border-radius: 8px;" />
            ${info.name}
          </div>
          <div style="font-size: 28px; color: #666; display: flex; max-width: 800px;">
            ${info.description}
          </div>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 40px 60px; background-color: #1d1b16;">
        <div style="display: flex; gap: 60px;">
          <div style="text-align: center; display: flex; flex-direction: column;">
            ${
              info.tools
                ? `<div style="color: #fb631b; font-weight: bold; font-size: 48px; display: flex; justify-content: center;">
              ${info.tools}
            </div>`
                : ""
            }
            <div style="font-size: 20px; color: #fcfcfa; display: flex; justify-content: center;">
              Tools
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="font-size: 28px; color: #fcfcfa; font-weight: 500; display: flex;">MCP Chat</div>
        </div>
      </div>
    </div>
  </div>`;

  return new ImageResponse(og, {
    width: 1200,
    height: 630,
    format: "png",
  });
}
