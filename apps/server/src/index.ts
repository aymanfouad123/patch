import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { serve } from "@hono/node-server";
import { createApp, createConvexRunHandlers } from "./api/app";
import { createRunnerClient } from "./convex";
import { loadEnv } from "./env";
import { startRunLoop } from "./runs/loop";
import { createVercelSandboxFactory } from "./sandbox/adapter";
import { readSandboxCredentials } from "./sandbox/credentials";

function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnvLocal();
const env = loadEnv();
const handlers = createConvexRunHandlers(env.CONVEX_URL);
const app = createApp({ env, ...handlers });
const runner = createRunnerClient(env);
const factory = createVercelSandboxFactory();
const credentials = readSandboxCredentials({
  VERCEL_TOKEN: env.VERCEL_TOKEN,
  VERCEL_TEAM_ID: env.VERCEL_TEAM_ID,
  VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
});

const loop = startRunLoop({ env, runner, factory, credentials });

const server = serve({ fetch: app.fetch, port: env.PORT }, () => {
  console.log(`patch server listening on :${env.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`received ${signal}; draining`);
  await loop.stop();
  server.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
