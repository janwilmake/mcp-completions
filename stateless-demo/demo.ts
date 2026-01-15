/// <reference types="@types/node" />
import { ChatCompletionCreateParamsStreaming } from "openai/resources/index.mjs";
import {
  chatCompletionsProxy,
  ChatCompletionRequest,
} from "../mcp-completions-stateless";
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
      server_url: "https://task-mcp.parallel.ai/mcp",
      authorization: "Bearer " + process.env.PARALLEL_API_KEY,
    },
    { type: "url_context", max_urls: 10 },
  ],
} satisfies ChatCompletionRequest as unknown as ChatCompletionCreateParamsStreaming);

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
