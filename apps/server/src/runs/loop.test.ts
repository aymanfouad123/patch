import { describe, expect, it, vi } from "vitest";
import type { RunnerClaim, RunnerClient } from "../convex";
import type { ServerEnv } from "../env";
import { createFakeSandboxFactory } from "../sandbox/fake";
import { startRunLoop } from "./loop";

const env: ServerEnv = {
  CONVEX_URL: "https://example.convex.cloud",
  CONVEX_SITE_URL: "https://example.convex.site",
  PATCH_RUNNER_SECRET: "secret",
  VERCEL_TOKEN: "t",
  VERCEL_TEAM_ID: "team",
  VERCEL_PROJECT_ID: "project",
  PORT: 8787,
  PATCH_WEB_ORIGIN: "http://localhost:3000",
  PREVIEW_TTL_MS: 60_000,
  WORKER_ID: "test-worker",
};

function claim(overrides: Partial<RunnerClaim> = {}): RunnerClaim {
  return {
    runId: "runs_1",
    claimId: "claim-1",
    status: "provisioning",
    stage: "creating_sandbox",
    cancelRequested: false,
    repoUrl: "https://github.com/example/fixture.git",
    commitSha: "abcdef1234567890abcdef1234567890abcdef12",
    workingDirectory: ".",
    installCommand: "pnpm install --frozen-lockfile",
    startCommand: "pnpm dev --hostname 0.0.0.0 --port 3000",
    port: 3000,
    healthPath: "/",
    previewMode: true,
    variableNames: [],
    profileVersion: 1,
    sandboxName: "patch-run-runs_1",
    createStartedAt: Date.now(),
    deadlineAt: Date.now() + 7 * 60_000,
    cleanupAttempts: 0,
    ...overrides,
  };
}

describe("startRunLoop", () => {
  it("claims, provisions, and marks ready", async () => {
    const { factory, created } = createFakeSandboxFactory();
    let claimed = false;
    const events: string[] = [];
    const runner: RunnerClient = {
      sweep: async () => {
        events.push("sweep");
        return { swept: 0 };
      },
      claimNext: async () => {
        if (claimed) return null;
        claimed = true;
        events.push("claim");
        return claim();
      },
      renewClaim: async () => ({ ok: true, cancelRequested: false }),
      recordStage: async ({ stage }) => {
        events.push(`stage:${stage}`);
        return true;
      },
      recordSandbox: async () => true,
      markReady: async () => {
        events.push("ready");
        return true;
      },
      markFailed: async () => true,
      markCleaned: async () => true,
    };

    const loop = startRunLoop({
      env,
      runner,
      factory,
      credentials: { token: "t", teamId: "team", projectId: "project" },
      log: () => {},
    });

    await vi.waitFor(() => {
      expect(events).toContain("ready");
    });
    await loop.stop();
    expect(created).toEqual(["patch-run-runs_1"]);
    expect(events[0]).toBe("sweep");
  });

  it("cleans up after a failed boot", async () => {
    const { factory, stopped } = createFakeSandboxFactory({ failAt: "health" });
    let claimed = false;
    const events: string[] = [];
    const runner: RunnerClient = {
      sweep: async () => ({ swept: 0 }),
      claimNext: async () => {
        if (claimed) return null;
        claimed = true;
        return claim({ createStartedAt: Date.now() - 120_000 });
      },
      renewClaim: async () => ({ ok: true, cancelRequested: false }),
      recordStage: async () => true,
      recordSandbox: async () => true,
      markReady: async () => true,
      markFailed: async (args) => {
        events.push(`failed:${args.failedStage}`);
        return true;
      },
      markCleaned: async (args) => {
        events.push(`cleaned:${args.outcome}`);
        return true;
      },
    };

    const loop = startRunLoop({
      env,
      runner,
      factory,
      credentials: { token: "t", teamId: "team", projectId: "project" },
      log: () => {},
    });
    await vi.waitFor(() => {
      expect(events).toContain("cleaned:failed");
    });
    await loop.stop();
    expect(events).toContain("failed:checking_readiness");
    expect(stopped).toEqual(["patch-run-runs_1"]);
  });
});
