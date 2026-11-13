import { ConvexHttpClient } from "convex/browser";
import type { ServerEnv } from "./env";

export type RunnerClient = {
  claimNext: (args: {
    workerId: string;
    claimMs: number;
  }) => Promise<RunnerClaim | null>;
  renewClaim: (args: {
    runId: string;
    claimId: string;
    claimMs: number;
  }) => Promise<{ ok: boolean; cancelRequested: boolean }>;
  recordStage: (args: {
    runId: string;
    claimId: string;
    stage: string;
  }) => Promise<boolean>;
  recordSandbox: (args: {
    runId: string;
    claimId: string;
    sandboxId: string;
    providerTimeoutAt: number;
  }) => Promise<boolean>;
  markReady: (args: {
    runId: string;
    claimId: string;
    previewUrl: string;
    readyUntil: number;
  }) => Promise<boolean>;
  markFailed: (args: {
    runId: string;
    claimId: string;
    failedStage: string;
    diagnostics: string;
    outcome?: string;
  }) => Promise<boolean>;
  markCleaned: (args: {
    runId: string;
    claimId: string;
    outcome: string;
    cleanupError?: string;
  }) => Promise<boolean>;
  sweep: (args: { now: number }) => Promise<{ swept: number }>;
};

export type RunnerClaim = {
  runId: string;
  claimId?: string;
  status: string;
  stage?: string;
  cancelRequested: boolean;
  repoUrl: string;
  commitSha: string;
  workingDirectory: string;
  installCommand: string;
  startCommand: string;
  port: number;
  healthPath: string;
  previewMode: boolean;
  variableNames: string[];
  profileVersion: number;
  sandboxName: string;
  sandboxId?: string;
  createStartedAt?: number;
  providerTimeoutAt?: number;
  previewUrl?: string;
  deadlineAt?: number;
  readyUntil?: number;
  terminalOutcome?: string;
  failedStage?: string;
  diagnostics?: string;
  cleanupAttempts: number;
};

export function createUserClient(convexUrl: string, jwt: string) {
  const client = new ConvexHttpClient(convexUrl);
  client.setAuth(jwt);
  return client;
}

async function runnerFetch<T>(
  env: ServerEnv,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${env.CONVEX_SITE_URL}/runner/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.PATCH_RUNNER_SECRET}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`runner ${path} failed (${response.status}): ${text.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

export function createRunnerClient(env: ServerEnv): RunnerClient {
  return {
    claimNext: (args) => runnerFetch(env, "claimNext", args),
    renewClaim: (args) => runnerFetch(env, "renewClaim", args),
    recordStage: (args) => runnerFetch(env, "recordStage", args),
    recordSandbox: (args) => runnerFetch(env, "recordSandbox", args),
    markReady: (args) => runnerFetch(env, "markReady", args),
    markFailed: (args) => runnerFetch(env, "markFailed", args),
    markCleaned: (args) => runnerFetch(env, "markCleaned", args),
    sweep: (args) => runnerFetch(env, "sweep", args),
  };
}
