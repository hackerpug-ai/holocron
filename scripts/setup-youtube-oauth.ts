/**
 * YouTube OAuth2 Setup Helper
 *
 * This script helps you set up YouTube OAuth2 credentials for transcript fetching.
 * YouTube caption downloads require OAuth2 authentication (API keys are insufficient).
 *
 * Usage:
 *   bun run scripts/setup-youtube-oauth.ts
 *
 * Steps:
 * 1. Run this script to get the authorization URL
 * 2. Open the URL in your browser
 * 3. Authorize with your Google account
 * 4. Copy the authorization code from the callback URL
 * 5. Paste the code when prompted
 * 6. Copy the refresh token from the output
 * 7. Add the refresh token to your .env file
 */

import { spawn } from "child_process";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

async function runConvexFunction(functionName: string, args?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const argsString = args ? `'${JSON.stringify(args)}'` : "";
    const convex = spawn("npx", ["convex", "run", functionName, argsString], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let output = "";
    let errorOutput = "";

    convex.stdout.on("data", (data) => {
      const text = data.toString();
      output += text;
    });

    convex.stderr.on("data", (data) => {
      const text = data.toString();
      errorOutput += text;
    });

    convex.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`Convex command failed: ${errorOutput}`));
        return;
      }

      try {
        // Try to parse JSON output
        const jsonMatch = output.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resolve(JSON.parse(jsonMatch[0]));
        } else {
          resolve(output.trim());
        }
      } catch {
        resolve(output.trim());
      }
    });
  });
}

async function main() {
  console.log("\n🔐 YouTube OAuth2 Setup Helper");
  console.log("=" .repeat(60));
  console.log("\nThis script will help you set up OAuth2 credentials for YouTube.");
  console.log("YouTube caption downloads require OAuth2 (API keys don't work).\n");

  // Step 1: Get authorization URL
  console.log("Step 1: Generating authorization URL...\n");

  try {
    const authUrl = await runConvexFunction("transcripts/oauth:getAuthorizationUrl");

    console.log("📋 Authorization URL:\n");
    console.log(authUrl);
    console.log("\n" + "=".repeat(60));

    // Step 2: User authorizes
    console.log("\nStep 2: Open the URL above in your browser.");
    console.log("  - Authorize the app with your Google account");
    console.log("  - You'll be redirected to http://localhost:3000/oauth/callback?code=...");
    console.log("  - Copy the 'code' parameter from the URL\n");

    const authCode = await question("Step 3: Paste the authorization code here: ");

    if (!authCode || authCode.trim().length === 0) {
      console.error("\n❌ No authorization code provided. Exiting.");
      process.exit(1);
    }

    // Step 3: Exchange code for refresh token
    console.log("\nStep 4: Exchanging authorization code for refresh token...\n");

    const tokenResult = await runConvexFunction("transcripts/oauth:exchangeCodeForToken", {
      code: authCode.trim(),
    });

    if (!tokenResult || !tokenResult.refresh_token) {
      console.error("\n❌ Failed to get refresh token. Check the error above.");
      process.exit(1);
    }

    console.log("✅ Success! Your refresh token:\n");
    console.log("─".repeat(60));
    console.log(tokenResult.refresh_token);
    console.log("─".repeat(60));

    // Step 4: Instructions
    console.log("\nStep 5: Add this to your .env file:\n");
    console.log(`YOUTUBE_OAUTH_REFRESH_TOKEN="${tokenResult.refresh_token}"`);
    console.log("\nThen deploy to Convex:");
    console.log("  npx convex env add YOUTUBE_OAUTH_REFRESH_TOKEN");

    console.log("\n" + "=".repeat(60));
    console.log("✨ OAuth2 setup complete!\n");
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();
