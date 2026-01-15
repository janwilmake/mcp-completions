#!/usr/bin/env bun

/// <reference types="@types/node" />

import { readFileSync } from "fs";
import { OpenAI } from "openai";
import {
  chatCompletionsProxy,
  ChatCompletionRequest,
} from "mcp-completions-stateless";

interface McpConfig {
  url: string;
  authorization_key: string;
}

interface EvalConfig {
  name: string;
  description: string;
  model: string;
  basePath: string;
  llm_key: string;
  mcps: McpConfig[];
  prompt: string;
  expected_result: string;
}

interface EvalFile {
  evals: EvalConfig[];
}

interface EvalResult {
  name: string;
  passed: boolean;
  actualResult: string;
  expectedResult: string;
  error?: string;
}

async function runSingleEval(evalConfig: EvalConfig): Promise<EvalResult> {
  const { fetchProxy } = chatCompletionsProxy({
    clientInfo: { name: "mcp-eval", version: "1.0.0" },
  });

  const apiKey = process.env[evalConfig.llm_key];
  if (!apiKey) {
    return {
      name: evalConfig.name,
      passed: false,
      actualResult: "",
      expectedResult: evalConfig.expected_result,
      error: `Missing environment variable: ${evalConfig.llm_key}`,
    };
  }

  const client = new OpenAI({
    apiKey,
    baseURL: evalConfig.basePath,
    fetch: fetchProxy,
  });

  // Build MCP tools array
  const tools: any[] = evalConfig.mcps.map((mcp) => ({
    type: "mcp",
    server_url: mcp.url,
    authorization: "Bearer " + process.env[mcp.authorization_key],
  }));

  try {
    // Run the eval (non-streaming to get full response)
    const response = await client.chat.completions.create({
      model: evalConfig.model,
      messages: [{ role: "user", content: evalConfig.prompt }],
      tools,
    } as ChatCompletionRequest as any);

    const actualResult =
      response.choices[0]?.message?.content ||
      JSON.stringify(response.choices[0]?.message?.tool_calls) ||
      "";

    // Use OpenAI to judge if the result matches expected
    const judgeClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const judgment = await judgeClient.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an eval judge. Compare the actual result against the expected result criteria.
Respond with ONLY "true" if the actual result satisfies the expected criteria, or "false" if it does not.
Do not explain, just output true or false.`,
        },
        {
          role: "user",
          content: `Expected criteria: ${evalConfig.expected_result}

Actual result: ${actualResult}

Does the actual result satisfy the expected criteria? Answer only true or false.`,
        },
      ],
    });

    const passed =
      judgment.choices[0]?.message?.content?.trim().toLowerCase() === "true";

    return {
      name: evalConfig.name,
      passed,
      actualResult,
      expectedResult: evalConfig.expected_result,
    };
  } catch (error: any) {
    let errorMessage: string;
    if (error?.status) {
      // OpenAI API error with HTTP status
      errorMessage = `HTTP ${error.status}: ${
        error.message || error.error?.message || "Unknown error"
      }`;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    } else {
      errorMessage = String(error);
    }
    return {
      name: evalConfig.name,
      passed: false,
      actualResult: "",
      expectedResult: evalConfig.expected_result,
      error: errorMessage,
    };
  }
}

async function main() {
  const evalFilePath = process.argv[2];

  if (!evalFilePath) {
    console.error("Usage: npx tsx run-eval.ts <mcp-eval.json>");
    process.exit(1);
  }

  const evalFile: EvalFile = JSON.parse(readFileSync(evalFilePath, "utf-8"));

  console.log(`Running ${evalFile.evals.length} evals in parallel...\n`);

  // Run all evals in parallel
  const results = await Promise.all(evalFile.evals.map(runSingleEval));

  // Print results
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  for (const result of results) {
    const status = result.passed
      ? "\x1b[32m✓ PASS\x1b[0m"
      : "\x1b[31m✗ FAIL\x1b[0m";
    console.log(`${status}: ${result.name}`);
    if (!result.passed) {
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      } else {
        console.log(`  Expected: ${result.expectedResult}`);
        console.log(`  Actual:`);
        console.log(`  \x1b[2m${result.actualResult}\x1b[0m`);
      }
    } else {
      // Show complete output in dim color for passing tests
      console.log(`  \x1b[2m${result.actualResult}\x1b[0m`);
    }
    console.log();
  }

  console.log(
    `\nResults: ${passed}/${results.length} passed, ${failed} failed`,
  );

  process.exit(failed > 0 ? 1 : 0);
}

main();
