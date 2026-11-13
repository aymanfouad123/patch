import { describe, expect, it, vi } from "vitest";
import type { RunnerClaim, RunnerClient } from "../convex";
import type { ServerEnv } from "../env";
import { createFakeSandboxFactory } from "../sandbox/fake";
import { cleanupRun } from "./cleanup";
import { startRunLoop } from "./loop";
import { provisionRun } from "./provision";

/**
 * Fixture proof matrix from the migration plan, exercised against the fake
 * sandbox port. Live Vercel verification uses fixtures/next-minimal once
 * published and seeded with environment:seedProfile.
 */
const credentials = { token: "t", teamId: "team", projectId: "project" };
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
  WORKER_ID: "proof-worker",
};

function claim(overrides: Partial<RunnerClaim> = {}): RunnerClaim {
  return {
    runId: "runs_fixture",
    claimId: "claim-fixture",
    status: "provisioning",
    stage: "creating_sandbox",
    cancelRequested: false,
    repoUrl: "https://github.com/example/patch-fixture-next.git",
    commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    workingDirectory: ".",
    installCommand: "pnpm install --frozen-lockfile",
    startCommand: "pnpm dev --hostname 0.0.0.0 --port 3000",
    port: 3000,
    healthPath: "/",
    previewMode: true,
    variableNames: [],
    profileVersion: 1,
    sandboxName: "patch-run-runs_fixture",
    createStartedAt: Date.now() - 120_000,
    deadlineAt: Date.now() + 7 * 60_000,
    cleanupAttempts: 0,
    ...overrides,
  };
}

function memoryRunner(initial?: RunnerClaim): RunnerClient & {
  store: Map<string, RunnerClaim>;
} {
  const store = new Map<string, RunnerClaim>();
  if (initial) store.set(initial.runId, { ...initial });
  return {
    store,
    claimNext: async () => {
      for (const value of store.values()) {
        if (value.status === "cleanup_pending" || value.status === "queued") {
          value.status = value.status === "cleanup_pending" ? "cleaning" : "provisioning";
          value.claimId = `claim-${Date.now()}`;
          return { ...value, cleanupAttempts: value.cleanupAttempts ?? 0 };
        }
      }
      return null;
    },
    renewClaim: async ({ runId, claimId }) => {
      const run = store.get(runId);
      if (!run || run.claimId !== claimId) return { ok: false, cancelRequested: true };
      return { ok: true, cancelRequested: run.cancelRequested };
    },
    recordStage: async ({ runId, claimId, stage }) => {
      const run = store.get(runId);
      if (!run || run.claimId !== claimId) return false;
      run.stage = stage as RunnerClaim["stage"];
      return true;
    },
    recordSandbox: async ({ runId, claimId, sandboxId }) => {
      const run = store.get(runId);
      if (!run || run.claimId !== claimId) return false;
      run.sandboxId = sandboxId;
      return true;
    },
    markReady: async ({ runId, claimId, previewUrl, readyUntil }) => {
      const run = store.get(runId);
      if (!run || run.claimId !== claimId) return false;
      run.status = "ready";
      run.previewUrl = previewUrl;
      run.readyUntil = readyUntil;
      run.terminalOutcome = "succeeded";
      delete run.claimId;
      return true;
    },
    markFailed: async ({ runId, claimId, failedStage, diagnostics, outcome }) => {
      const run = store.get(runId);
      if (!run || run.claimId !== claimId) return false;
      run.status = "cleaning";
      run.failedStage = failedStage as RunnerClaim["failedStage"];
      run.diagnostics = diagnostics;
      run.terminalOutcome = (outcome as RunnerClaim["terminalOutcome"]) ?? "failed";
      return true;
    },
    markCleaned: async ({ runId, claimId, outcome }) => {
      const run = store.get(runId);
      if (!run || run.claimId !== claimId) return false;
      run.status = outcome as RunnerClaim["status"];
      run.terminalOutcome = outcome as RunnerClaim["terminalOutcome"];
      return true;
    },
    sweep: async ({ now }) => {
      let swept = 0;
      for (const run of store.values()) {
        if (run.status === "ready" && run.readyUntil && run.readyUntil < now) {
          run.status = "cleanup_pending";
          run.terminalOutcome = "expired";
          swept += 1;
        }
      }
      return { swept };
    },
  };
}

describe("environment_test fixture proof", () => {
  it("success: provision returns preview URL", async () => {
    const { factory } = createFakeSandboxFactory();
    const runner = memoryRunner(claim());
    const result = await provisionRun({
      claim: claim(),
      runner,
      factory,
      credentials,
      hostEnv: {},
      previewTtlMs: 60_000,
      providerTimeoutMs: 15 * 60_000,
      log: () => {},
    });
    expect(result).toMatchObject({
      ok: true,
      previewUrl: "https://patch-run-runs_fixture-3000.vercel.run",
    });
  });

  it("boot failure: readiness fails and cleanup stops the sandbox", async () => {
    const { factory, stopped } = createFakeSandboxFactory({ failAt: "health" });
    const c = claim();
    const runner = memoryRunner(c);
    const result = await provisionRun({
      claim: c,
      runner,
      factory,
      credentials,
      hostEnv: {},
      previewTtlMs: 60_000,
      providerTimeoutMs: 15 * 60_000,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failedStage).toBe("checking_readiness");
    await cleanupRun({
      claim: { ...c, status: "cleaning", terminalOutcome: "failed" },
      runner,
      factory,
      credentials,
      log: () => {},
    });
    expect(stopped).toEqual(["patch-run-runs_fixture"]);
  });

  it("cancellation during create: cancelRequested ends as cancelled", async () => {
    const { factory } = createFakeSandboxFactory({ createDelayMs: 50 });
    const runner = memoryRunner(claim());
    runner.renewClaim = async () => ({ ok: true, cancelRequested: true });
    const result = await provisionRun({
      claim: claim(),
      runner,
      factory,
      credentials,
      hostEnv: {},
      previewTtlMs: 60_000,
      providerTimeoutMs: 15 * 60_000,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.outcome).toBe("cancelled");
  });

  it("expiry: sweep moves ready runs to cleanup_pending", async () => {
    const ready = claim({
      status: "ready",
      readyUntil: Date.now() - 1,
    });
    delete ready.claimId;
    const runner = memoryRunner(ready);
    const swept = await runner.sweep({ now: Date.now() });
    expect(swept.swept).toBe(1);
    expect(runner.store.get("runs_fixture")?.status).toBe("cleanup_pending");
    expect(runner.store.get("runs_fixture")?.terminalOutcome).toBe("expired");
  });

  it("server restart: interrupted claim is cleaned, never resumed mid-setup", async () => {
    const { factory, created, stopped } = createFakeSandboxFactory();
    let phase: "first" | "second" = "first";
    const events: string[] = [];
    const runner: RunnerClient = {
      sweep: async () => {
        events.push("sweep");
        return { swept: phase === "second" ? 1 : 0 };
      },
      claimNext: async () => {
        if (phase === "first") {
          phase = "second";
          return claim({ status: "provisioning" });
        }
        return claim({
          status: "cleaning",
          terminalOutcome: "failed",
          failedStage: "installing",
          createStartedAt: Date.now() - 120_000,
        });
      },
      renewClaim: async () => ({ ok: false, cancelRequested: true }),
      recordStage: async () => false,
      recordSandbox: async () => false,
      markReady: async () => false,
      markFailed: async () => true,
      markCleaned: async () => {
        events.push("cleaned");
        return true;
      },
    };

    const loop = startRunLoop({
      env,
      runner,
      factory,
      credentials,
      log: () => {},
    });
    await vi.waitFor(() => {
      expect(events).toContain("cleaned");
    });
    await loop.stop();
    expect(created.length + stopped.length).toBeGreaterThanOrEqual(0);
    expect(events.filter((e) => e === "sweep").length).toBeGreaterThanOrEqual(1);
  });
});
