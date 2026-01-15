/// <reference types="@types/node" />
import { ChatCompletionCreateParamsNonStreaming } from "openai/resources/index.mjs";
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

const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "What tools do you have?" }],
  tools: [
    {
      type: "mcp",
      server_url: "https://task-mcp.parallel.ai/mcp",
      authorization: "Bearer " + process.env.PARALLEL_API_KEY,
    },
    { type: "url_context", max_urls: 10 },
  ],
} satisfies ChatCompletionRequest as unknown as ChatCompletionCreateParamsNonStreaming);

console.log(response?.choices[0]?.message?.content);
