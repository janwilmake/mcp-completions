interface MCPToolSpec {
  type: "mcp";
  server_url: string;
  authorization?: string; // Bearer token or other auth header value
  allowed_tools?: { tool_names: string[] };
  require_approval?: "never";
}

interface URLContextTool {
  type: "url_context";
  max_urls?: number;
  max_context_length?: number;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool" | "function";
    content?: string | null;
    name?: string;
    tool_calls?: Array<{
      id: string;
      type: "function";
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  tools?: Array<
    | {
        type: "function";
        function: {
          name: string;
          description?: string;
          parameters?: Record<string, any>;
        };
      }
    | MCPToolSpec
    | URLContextTool
  >;
  tool_choice?:
    | "none"
    | "auto"
    | { type: "function"; function: { name: string } };
  user?: string;
  [key: string]: any;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
  outputSchema?: any;
}

interface MCPSession {
  sessionId?: string;
  initialized: boolean;
  tools?: MCPTool[];
}

interface UsageStats {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  additional_cost_cents?: number;
}

export interface ShadowUrlConfig {
  [oldHostname: string]: string;
}

export interface ExtractUrlConfig {
  url: string;
  bearerToken: string;
}

const mcpSessions = new Map<string, MCPSession>();

async function parseMCPResponse(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("text/event-stream")) {
    if (!response.body) throw new Error("No response body for event stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine || trimmedLine.startsWith(":")) continue;

          if (trimmedLine.startsWith("data: ")) {
            const data = trimmedLine.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.jsonrpc === "2.0") {
                reader.releaseLock();
                return parsed;
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    throw new Error("No valid JSON-RPC response received from event stream");
  } else {
    const responseText = await response.text();
    if (!responseText.trim()) throw new Error("Empty response body");
    try {
      return JSON.parse(responseText);
    } catch {
      throw new Error(`Invalid JSON response: ${responseText}`);
    }
  }
}

async function initializeMCPSession(
  serverUrl: string,
  authorization?: string,
  clientInfo: { name: string; version: string } = {
    name: "MCPCompletions",
    version: "1.0.0",
  },
) {
  const mcpHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json,text/event-stream",
    "MCP-Protocol-Version": "2025-06-18",
    ...(authorization && { Authorization: authorization }),
  };

  const initResponse = await fetch(serverUrl, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: { roots: { listChanged: true }, sampling: {} },
        clientInfo,
      },
    }),
  });

  if (!initResponse.ok) throw new Error(`Init failed: ${initResponse.status}`);

  const initResult = await parseMCPResponse(initResponse);
  if (initResult.error)
    throw new Error(`Init error: ${initResult.error.message}`);

  const sessionId = initResponse.headers.get("Mcp-Session-Id");
  if (sessionId) mcpHeaders["Mcp-Session-Id"] = sessionId;

  await fetch(serverUrl, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
  });

  const toolsResponse = await fetch(serverUrl, {
    method: "POST",
    headers: mcpHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now() + 1,
      method: "tools/list",
    }),
  });

  const toolsResult = await parseMCPResponse(toolsResponse);
  if (toolsResult.error)
    throw new Error(`Tools list error: ${toolsResult.error.message}`);

  return { sessionId, tools: toolsResult.result?.tools || [] };
}

function applyShadowUrl(url: string, shadowUrls?: ShadowUrlConfig): string {
  if (!shadowUrls) return url;

  try {
    const urlObj = new URL(url);
    const newHostname = shadowUrls[urlObj.hostname];
    if (newHostname) {
      urlObj.hostname = newHostname;
      return urlObj.toString();
    }
  } catch {
    // Invalid URL, return as-is
  }
  return url;
}

function extractUrlsFromMessages(
  messages: Array<{ role: string; content?: string | null }>,
): string[] {
  const urlRegex =
    /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
  const allUrls = new Set<string>();

  for (const message of messages) {
    if (message.role === "user" && message.content) {
      const urls = message.content.match(urlRegex) || [];
      urls.forEach((url) => allUrls.add(url));
    }
  }

  return Array.from(allUrls);
}

async function fetchUrlContext(
  url: string,
  shadowUrls?: ShadowUrlConfig,
  extractConfig?: ExtractUrlConfig,
): Promise<{
  url: string;
  text: string;
  tokens: number;
  failed?: boolean;
  costCents?: number;
}> {
  const effectiveUrl = applyShadowUrl(url, shadowUrls);

  try {
    const headers: Record<string, string> = {
      Accept: "text/markdown,text/plain,*/*",
    };

    const response = await fetch(effectiveUrl, { headers });
    const contentType = response.headers.get("content-type") || "";
    const isTextContent =
      contentType.startsWith("text/plain") ||
      contentType.startsWith("text/markdown") ||
      contentType.startsWith("application/json");

    if (!isTextContent && extractConfig) {
      const extractUrl = `${extractConfig.url}/${encodeURIComponent(
        effectiveUrl,
      )}`;
      const extractResponse = await fetch(extractUrl, {
        headers: {
          Authorization: `Bearer ${extractConfig.bearerToken}`,
          Accept: "text/markdown,text/plain",
        },
      });

      if (extractResponse.ok) {
        const extractedText = await extractResponse.text();
        const priceHeader = extractResponse.headers.get("x-price");
        const costCents = priceHeader ? parseFloat(priceHeader) : 0;
        const tokens = Math.round(extractedText.length / 5);
        const extractContentType =
          extractResponse.headers.get("content-type")?.split(";")[0] ||
          "markdown";
        const mime = extractContentType.split("/")[1] || "markdown";

        return {
          url,
          text: `\`\`\`${mime}\n${extractedText}\n\n\`\`\`\n`,
          tokens,
          costCents,
        };
      }
    }

    const isHtml = contentType?.startsWith("text/html");
    const isPdf = contentType?.startsWith("application/pdf");

    if (isHtml || isPdf) {
      return {
        url,
        text: `${isHtml ? "HTML" : "PDF"} urls are not supported.`,
        tokens: 0,
      };
    }

    const text = await response.text();
    const mime = contentType?.split(";")[0].split("/")[1] || "text";
    const tokens = Math.round(text.length / 5);
    return {
      url,
      text: `\`\`\`${mime}\n${text}\n\n\`\`\`\n`,
      tokens,
    };
  } catch (error: any) {
    return {
      url,
      text: `Failed to fetch: ${error.message}. To get context for any url, use jina.ai, firecrawl.dev, uithub.com (for code), or xymake.com (for x threads), or any alternative.`,
      tokens: 0,
      failed: true,
    };
  }
}

async function generateUrlContext(
  messages: Array<{ role: string; content?: string | null }>,
  maxUrls: number = 10,
  maxContextLength: number = 1024 * 1024,
  shadowUrls?: ShadowUrlConfig,
  extractConfig?: ExtractUrlConfig,
): Promise<{ context: string | undefined; costCents: number }> {
  const urls = extractUrlsFromMessages(messages);

  if (urls.length === 0) return { context: undefined, costCents: 0 };

  const urlsToFetch = urls.slice(0, maxUrls);

  let hasHtml = false;
  let hasError = false;
  let totalCostCents = 0;

  const urlResults = await Promise.all(
    urlsToFetch.map((url) => fetchUrlContext(url, shadowUrls, extractConfig)),
  );

  for (const result of urlResults) {
    if (
      result.text.includes("HTML urls are not supported") ||
      result.text.includes("PDF urls are not supported")
    )
      hasHtml = true;
    if (result.failed) hasError = true;
    if (result.costCents) totalCostCents += result.costCents;
  }

  let context = urlResults.reduce((previous, { url, text, tokens }) => {
    const newContent = `${previous}\n${url} (${tokens} tokens) \n${
      previous.length > maxContextLength
        ? "Omitted due to context length."
        : text
    }\n`;
    return newContent;
  }, "");

  if (hasHtml || hasError) {
    context =
      context +
      `\n\nThere were one or more URLs pasted that returned ${
        hasHtml ? "HTML/PDF" : "an error"
      }. If these URLs are needed to answer the user request, please instruct the user to use the suggested alternatives.`;
  }

  return { context, costCents: totalCostCents };
}

export const chatCompletionsProxy = (config: {
  clientInfo?: { name: string; version: string };
  shadowUrls?: ShadowUrlConfig;
  extractUrl?: ExtractUrlConfig;
}) => {
  const {
    clientInfo = { name: "MCPCompletions", version: "1.0.0" },
    shadowUrls,
    extractUrl,
  } = config;

  const fetchProxy = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const llmEndpoint = typeof input === "string" ? input : input.toString();
    const headers = init?.headers ? new Headers(init.headers) : new Headers();

    let body: ChatCompletionRequest;
    try {
      if (init?.body) {
        let bodyText: string;

        if (typeof init.body === "string") {
          bodyText = init.body;
        } else if (init.body instanceof ReadableStream) {
          const reader = init.body.getReader();
          const decoder = new TextDecoder();
          let result = "";

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              result += decoder.decode(value, { stream: true });
            }
            result += decoder.decode();
            bodyText = result;
          } finally {
            reader.releaseLock();
          }
        } else if (init.body instanceof ArrayBuffer) {
          bodyText = new TextDecoder().decode(init.body);
        } else if (init.body instanceof Uint8Array) {
          bodyText = new TextDecoder().decode(init.body);
        } else {
          bodyText = init.body.toString();
        }

        body = JSON.parse(bodyText);
      } else {
        throw new Error("No request body provided");
      }
    } catch (error) {
      console.error("Error parsing request body:", error);
      return new Response(
        JSON.stringify({
          error: {
            message: "Invalid JSON in request body",
            type: "invalid_request_error",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const requestId = `chatcmpl-${Date.now()}`;
    const userRequestedStream = body.stream === true;

    // Force streaming internally for MCP tool processing
    body.stream = true;

    if (body.tools) {
      const mcpTools = body.tools.filter((x) => x.type === "mcp");
      const invalidMcpTools = mcpTools.filter(
        (x) =>
          ((x as MCPToolSpec).require_approval || "never") !== "never" ||
          !(x as MCPToolSpec).server_url,
      );
      if (invalidMcpTools.length > 0) {
        return new Response(
          JSON.stringify({
            error: {
              message: "Invalid MCP tools",
              type: "invalid_request_error",
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    try {
      let mcpToolMap:
        | Map<
            string,
            { serverUrl: string; originalName: string; authorization?: string }
          >
        | undefined;

      let additionalCostCents = 0;

      // Process URL context
      const urlContextTool = body.tools?.find((x) => x.type === "url_context");
      if (urlContextTool) {
        const maxUrls = (urlContextTool as URLContextTool).max_urls || 10;
        const maxContextLength =
          (urlContextTool as URLContextTool).max_context_length || 1024 * 1024;

        const { context: urlContext, costCents } = await generateUrlContext(
          body.messages,
          maxUrls,
          maxContextLength,
          shadowUrls,
          extractUrl,
        );

        additionalCostCents += costCents;

        if (urlContext) {
          body.messages.unshift({ role: "system", content: urlContext });
        }

        body.tools = body.tools?.filter((x) => x.type !== "url_context");

        if (!body.tools?.length) {
          body.tools = undefined;
        }
      }

      // Process MCP tools
      if (body.tools?.length) {
        const transformedTools: Array<any> = [];
        const toolMap = new Map<
          string,
          { serverUrl: string; originalName: string; authorization?: string }
        >();

        // Initialize all MCP sessions and discover tools
        const mcpToolSpecs = body.tools.filter(
          (x) => x.type === "mcp",
        ) as MCPToolSpec[];

        for (const toolSpec of mcpToolSpecs) {
          const sessionKey = toolSpec.server_url;
          let session = mcpSessions.get(sessionKey);

          if (!session?.initialized) {
            try {
              const sessionData = await initializeMCPSession(
                toolSpec.server_url,
                toolSpec.authorization,
                clientInfo,
              );
              session = {
                sessionId: sessionData.sessionId || undefined,
                initialized: true,
                tools: sessionData.tools,
              };
              mcpSessions.set(sessionKey, session);
            } catch (error) {
              console.error(
                `Failed to initialize MCP session for ${toolSpec.server_url}:`,
                error,
              );
              continue;
            }
          }

          const hostname = new URL(toolSpec.server_url).hostname;

          for (const mcpTool of session.tools || []) {
            if (
              toolSpec.allowed_tools?.tool_names &&
              !toolSpec.allowed_tools.tool_names.includes(mcpTool.name)
            )
              continue;

            const functionName = `mcp_tool_${hostname.replaceAll(".", "-")}_${
              mcpTool.name
            }`;
            toolMap.set(functionName, {
              serverUrl: toolSpec.server_url,
              originalName: mcpTool.name,
              authorization: toolSpec.authorization,
            });

            transformedTools.push({
              type: "function",
              function: {
                name: functionName,
                description: `${
                  mcpTool.description || mcpTool.name
                } (via MCP server: ${hostname})`,
                parameters: mcpTool.inputSchema || {},
              },
            });
          }
        }

        // Keep non-MCP tools
        for (const tool of body.tools) {
          if (tool.type === "function") {
            transformedTools.push(tool);
          }
        }

        if (transformedTools.length > 0) {
          body.tools = transformedTools;
        } else {
          body.tools = undefined;
        }

        mcpToolMap = toolMap;
      }

      const encoder = new TextEncoder();

      // Helper to emit streaming chunk or collect for non-streaming
      let collectedContent = "";
      let collectedReasoningContent = "";

      const stream = new ReadableStream({
        async start(controller) {
          try {
            let currentMessages = [...body.messages];
            let remainingTokens = body.max_completion_tokens || body.max_tokens;
            const userRequestedUsage = body.stream_options?.include_usage;
            const totalUsage: UsageStats = {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
              additional_cost_cents: additionalCostCents,
            };

            const emitChunk = (chunk: any) => {
              if (userRequestedStream) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
                );
              }
              // Collect content for non-streaming response
              const delta = chunk.choices?.[0]?.delta;
              if (delta?.content) {
                collectedContent += delta.content;
              }
              if (delta?.reasoning_content) {
                collectedReasoningContent += delta.reasoning_content;
              }
            };

            emitChunk({
              id: requestId,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: body.model,
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant" },
                  finish_reason: null,
                },
              ],
            });

            while (remainingTokens === undefined || remainingTokens > 0) {
              const stepBody = { ...body };
              stepBody.messages = currentMessages;

              if (remainingTokens !== undefined) {
                if (body.max_completion_tokens) {
                  stepBody.max_completion_tokens = remainingTokens;
                } else if (body.max_tokens) {
                  stepBody.max_tokens = remainingTokens;
                }
              }

              stepBody.stream_options = { include_usage: true };

              const response = await fetch(llmEndpoint, {
                method: "POST",
                headers,
                body: JSON.stringify(stepBody),
              });

              if (!response.ok) {
                const message = await response.text();
                throw new Error(
                  `API request failed: ${llmEndpoint} - ${response.status} - ${message}`,
                );
              }

              if (!response.body) throw new Error("No response body");

              const reader = response.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let assistantMessage = "";
              let toolCalls: Array<{
                id: string;
                name: string;
                arguments: any;
              }> = [];
              let toolCallBuffer = new Map<number, any>();
              let finished = false;
              let stepUsage: UsageStats | null = null;

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value);
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    if (!line.startsWith("data: ") || line === "data: [DONE]")
                      continue;

                    try {
                      const data = JSON.parse(line.slice(6));
                      const choice = data.choices[0];

                      if (data.usage) {
                        stepUsage = data.usage;
                        if (choice?.finish_reason !== "tool_calls") continue;
                      }

                      if (
                        choice?.delta?.content ||
                        choice.delta?.refusal ||
                        choice.delta?.reasoning_content
                      ) {
                        assistantMessage += choice.delta.content || "";
                        emitChunk({
                          id: requestId,
                          object: "chat.completion.chunk",
                          created: Math.floor(Date.now() / 1000),
                          model: body.model,
                          choices: [
                            {
                              index: 0,
                              delta: {
                                content: choice.delta.content,
                                refusal: choice.delta.refusal,
                                reasoning_content:
                                  choice.delta.reasoning_content,
                              },
                              finish_reason: null,
                            },
                          ],
                        });
                      }

                      if (choice?.delta?.tool_calls) {
                        for (const toolCall of choice.delta.tool_calls) {
                          const toolIndex = toolCall.index;
                          if (!toolCallBuffer.has(toolIndex)) {
                            toolCallBuffer.set(toolIndex, {
                              id: "",
                              name: "",
                              arguments: "",
                            });
                          }
                          const bufferedCall = toolCallBuffer.get(toolIndex);
                          if (toolCall.id) bufferedCall.id = toolCall.id;
                          if (toolCall.function?.name)
                            bufferedCall.name += toolCall.function.name;
                          if (toolCall.function?.arguments)
                            bufferedCall.arguments +=
                              toolCall.function.arguments;
                        }
                      }

                      if (choice?.finish_reason === "tool_calls") {
                        for (const bufferedCall of toolCallBuffer.values()) {
                          if (bufferedCall.name && bufferedCall.arguments) {
                            try {
                              toolCalls.push({
                                id: bufferedCall.id,
                                name: bufferedCall.name,
                                arguments: JSON.parse(bufferedCall.arguments),
                              });
                            } catch (e) {
                              console.error(
                                "Error parsing tool call arguments:",
                                e,
                              );
                            }
                          }
                        }
                        break;
                      }

                      if (
                        choice?.finish_reason === "stop" ||
                        choice?.finish_reason === "length"
                      ) {
                        finished = true;
                        break;
                      }
                    } catch {}
                  }
                }
              } finally {
                reader.releaseLock();
              }

              if (stepUsage) {
                totalUsage.prompt_tokens += stepUsage.prompt_tokens;
                totalUsage.completion_tokens += stepUsage.completion_tokens;
                totalUsage.total_tokens += stepUsage.total_tokens;

                if (remainingTokens !== undefined) {
                  remainingTokens -= stepUsage.completion_tokens;
                }
              }

              if (assistantMessage || toolCalls.length) {
                const assistantMsg: any = {
                  role: "assistant",
                  content: assistantMessage || null,
                };

                if (toolCalls.length) {
                  assistantMsg.tool_calls = toolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function",
                    function: {
                      name: tc.name,
                      arguments: JSON.stringify(tc.arguments),
                    },
                  }));
                }

                currentMessages.push(assistantMsg);
              }

              if (finished) break;
              if (!toolCalls.length) break;
              if (remainingTokens !== undefined && remainingTokens <= 0) break;

              for (const toolCall of toolCalls) {
                if (
                  mcpToolMap?.has(toolCall.name) &&
                  toolCall.name.startsWith("mcp_tool_")
                ) {
                  const toolInfo = mcpToolMap.get(toolCall.name)!;
                  const hostname = new URL(toolInfo.serverUrl).hostname;

                  const toolInput = `\n\n<details><summary>tool ${
                    toolInfo.originalName
                  } (${hostname})</summary>\n\n\`\`\`json\n${JSON.stringify(
                    toolCall.arguments,
                    null,
                    2,
                  )}\n\`\`\`\n\n</details>`;
                  emitChunk({
                    id: requestId,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: body.model,
                    choices: [
                      {
                        index: 0,
                        delta: { content: toolInput },
                        finish_reason: null,
                      },
                    ],
                  });

                  try {
                    const sessionKey = toolInfo.serverUrl;
                    let session = mcpSessions.get(sessionKey);

                    if (!session?.initialized) {
                      const sessionData = await initializeMCPSession(
                        toolInfo.serverUrl,
                        toolInfo.authorization,
                        clientInfo,
                      );
                      session = {
                        sessionId: sessionData.sessionId || undefined,
                        initialized: true,
                        tools: sessionData.tools,
                      };
                      mcpSessions.set(sessionKey, session);
                    }

                    const executeHeaders: Record<string, string> = {
                      "Content-Type": "application/json",
                      Accept: "application/json,text/event-stream",
                      "MCP-Protocol-Version": "2025-06-18",
                      ...(toolInfo.authorization && {
                        Authorization: toolInfo.authorization,
                      }),
                      ...(session.sessionId && {
                        "Mcp-Session-Id": session.sessionId,
                      }),
                    };

                    const toolResponse = await fetch(toolInfo.serverUrl, {
                      method: "POST",
                      headers: executeHeaders,
                      body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: Date.now(),
                        method: "tools/call",
                        params: {
                          name: toolInfo.originalName,
                          arguments: toolCall.arguments,
                        },
                      }),
                    });

                    if (toolResponse.status === 404 && session.sessionId) {
                      mcpSessions.delete(sessionKey);
                      throw new Error(
                        "Session expired, please retry the request",
                      );
                    }

                    if (!toolResponse.ok) {
                      if (toolResponse.status === 401) {
                        throw new Error(
                          `Authentication failed for ${hostname}. Please check your authorization token.`,
                        );
                      } else {
                        const errorText = await toolResponse.text();
                        throw new Error(
                          `Tool ${toolInfo.originalName} failed with status ${toolResponse.status}: ${errorText}`,
                        );
                      }
                    }

                    const toolResult = await parseMCPResponse(toolResponse);
                    if (toolResult.error) {
                      throw new Error(
                        `${toolResult.error.message} (code: ${toolResult.error.code})`,
                      );
                    }

                    const content = toolResult.result?.content;
                    let formattedResult: string;

                    if (!content || !Array.isArray(content)) {
                      const jsonString = JSON.stringify(toolResult, null, 2);
                      formattedResult = `<details><summary>Error Result (±${Math.round(
                        jsonString.length / 5,
                      )} tokens)</summary>\n\n\`\`\`json\n${jsonString}\n\`\`\`\n\n</details>\n\nTool returned invalid response structure`;
                    } else {
                      const contentBlocks = content
                        .map((item) => {
                          if (item.type === "text") {
                            try {
                              const parsed = JSON.parse(item.text);
                              return `\`\`\`json\n${JSON.stringify(
                                parsed,
                                null,
                                2,
                              )}\n\`\`\``;
                            } catch {
                              return `\`\`\`markdown\n${item.text}\n\`\`\``;
                            }
                          } else if (item.type === "image") {
                            return `\`\`\`\n[Image: ${item.data}]\n\`\`\``;
                          } else {
                            return `\`\`\`json\n${JSON.stringify(
                              item,
                              null,
                              2,
                            )}\n\`\`\``;
                          }
                        })
                        .join("\n\n");

                      const totalSize = content.reduce((size, item) => {
                        return (
                          size +
                          (item.type === "text"
                            ? item.text?.length || 0
                            : JSON.stringify(item).length)
                        );
                      }, 0);

                      formattedResult = `<details><summary>Result (±${Math.round(
                        totalSize / 5,
                      )} tokens)</summary>\n\n${contentBlocks}\n\n</details>`;
                    }

                    currentMessages.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: formattedResult,
                    });

                    const toolFeedback = `\n\n${formattedResult}\n\n`;
                    emitChunk({
                      id: requestId,
                      object: "chat.completion.chunk",
                      created: Math.floor(Date.now() / 1000),
                      model: body.model,
                      choices: [
                        {
                          index: 0,
                          delta: { content: toolFeedback },
                          finish_reason: null,
                        },
                      ],
                    });
                  } catch (error: any) {
                    const errorMsg = `**Error**: ${error.message}`;
                    currentMessages.push({
                      role: "tool",
                      tool_call_id: toolCall.id,
                      content: errorMsg,
                    });

                    emitChunk({
                      id: requestId,
                      object: "chat.completion.chunk",
                      created: Math.floor(Date.now() / 1000),
                      model: body.model,
                      choices: [
                        {
                          index: 0,
                          delta: { content: `\n\n${errorMsg}\n\n` },
                          finish_reason: null,
                        },
                      ],
                    });
                  }
                }
              }
            }

            if (userRequestedStream) {
              // Streaming response - send final chunk
              const finalChunk: any = {
                id: requestId,
                object: "chat.completion.chunk",
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              };

              if (userRequestedUsage && totalUsage.total_tokens > 0) {
                finalChunk.usage = totalUsage;
              }

              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(finalChunk)}\n\n`),
              );
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            } else {
              // Non-streaming response - send complete response
              const nonStreamingResponse: any = {
                id: requestId,
                object: "chat.completion",
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                  {
                    index: 0,
                    message: {
                      role: "assistant",
                      content: collectedContent || null,
                      ...(collectedReasoningContent && {
                        reasoning_content: collectedReasoningContent,
                      }),
                    },
                    finish_reason: "stop",
                  },
                ],
                usage: totalUsage,
              };

              controller.enqueue(
                encoder.encode(JSON.stringify(nonStreamingResponse)),
              );
            }
            controller.close();
          } catch (error) {
            console.error("Stream error:", error);
            controller.error(error);
          }
        },
      });

      return new Response(stream, {
        headers: userRequestedStream
          ? {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            }
          : {
              "Content-Type": "application/json",
            },
      });
    } catch (error) {
      console.error("Proxy error:", error);
      return new Response(
        JSON.stringify({
          error: { message: "Internal server error", type: "internal_error" },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  };

  return { fetchProxy };
};
