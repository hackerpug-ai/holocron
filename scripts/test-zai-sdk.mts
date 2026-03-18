/**
 * Test script to debug Z.ai API calls via Vercel AI SDK
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";

const ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4";
const ZAI_API_KEY = process.env.ZAI_API_KEY;

if (!ZAI_API_KEY) {
  console.error("ZAI_API_KEY not set");
  process.exit(1);
}

console.log("Base URL:", ZAI_BASE_URL);
console.log("API Key:", ZAI_API_KEY.slice(0, 10) + "...");

const zai = createOpenAI({
  baseURL: ZAI_BASE_URL,
  apiKey: ZAI_API_KEY,
});

// Must use .chat() to get Chat Completions API instead of Responses API
const model = zai.chat("glm-4.7");

async function main() {
  try {
    console.log("Calling generateText...");
    const result = await generateText({
      model,
      prompt: "Hello!",
      maxTokens: 10,
    });
    console.log("Success:", result.text);
  } catch (error: any) {
    console.error("Error:", error.message);
    if (error.url) console.error("URL:", error.url);
    if (error.responseBody) console.error("Response body:", error.responseBody);
    if (error.cause) console.error("Cause:", error.cause);
    console.error("Full error:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
  }
}

main();
