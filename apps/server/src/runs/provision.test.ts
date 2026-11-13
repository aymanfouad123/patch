import { describe, expect, it, vi } from "vitest";
import type { RunnerClaim, RunnerClient } from "../convex";
import { createFakeSandboxFactory } from "../sandbox/fake";
import { provisionRun } from "./provision";

function baseClaim(overrides: Partial<RunnerClaim> = {}): RunnerClaim {
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

function createRunner(opts?: {
  cancelAfterStage?: string;
  rejectStages?: boolean;
}): RunnerClient & { calls: string[] } {
  const calls: string[] = [];
  let cancelRequested = false;
  return {
    calls,
    claimNext: async () => null,
    renewClaim: async () => {
      calls.push("renew");
      return { ok: true, cancelRequested };
    },
    recordStage: async ({ stage }) => {
      calls.push(`stage:${stage}`);
      if (opts?.rejectStages) return false;
      if (opts?.cancelAfterStage === stage) cancelRequested = true;
      return true;
    },
    recordSandbox: async () => {
      calls.push("sandbox");
      return true;
    },
    markReady: async () => {
      calls.push("ready");
      return true;
    },
    markFailed: async () => true,
    markCleaned: async () => true,
    sweep: async () => ({ swept: 0 }),
  };
}

const credentials = { token: "t", teamId: "team", projectId: "project" };

describe("provisionRun", () => {
  it("boots a fixture and returns a preview URL", async () => {
    const { factory, created } = createFakeSandboxFactory();
    const runner = createRunner();
    const result = await provisionRun({
      claim: baseClaim(),
      runner,
      factory,
      credentials,
      hostEnv: {},
      previewTtlMs: 60_000,
      providerTimeoutMs: 15 * 60_000,
      log: () => {},
    });
    expect(result).toEqual({
      ok: true,
      previewUrl: "https://patch-run-runs_1-3000.vercel.run",
    });
    expect(created).toEqual(["patch-run-runs_1"]);
    expect(runner.calls).toContain("ready");
  });

  it("fails health checks with redacted diagnostics", async () => {
    const { factory } = createFakeSandboxFactory({
      failAt: "health",
      healthLog: "boom secret-value",
    });
    const runner = createRunner();
    const result = await provisionRun({
      claim: baseClaim({
        previewMode: false,
        variableNames: ["DEMO_SECRET"],
      }),
      runner,
      factory,
      credentials,
      hostEnv: { PATCH_DEV_DEMO_SECRET: "secret-value" },
      previewTtlMs: 60_000,
      providerTimeoutMs: 15 * 60_000,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStage).toBe("checking_readiness");
      expect(result.diagnostics).toContain("[REDACTED]");
      expect(result.diagnostics).not.toContain("secret-value");
    }
  });

  it("fails when a sandbox name already exists", async () => {
    const { factory } = createFakeSandboxFactory({
      existingNames: new Set(["patch-run-runs_1"]),
    });
    // Pre-seed live map via create then leave it
    const seeded = createFakeSandboxFactory();
    await seeded.factory.create({
      name: "patch-run-runs_1",
      credentials,
      port: 3000,
      timeoutMs: 1000,
      creationEnv: {},
    });
    const runner = createRunner();
    const result = await provisionRun({
      claim: baseClaim(),
      runner,
      factory: {
        create: factory.create,
        get: async ({ name }) =>
          name === "patch-run-runs_1"
            ? {
                name,
                cwd: "/tmp",
                sandboxId: "existing",
                domain: () => "",
                runCommand: async () => ({
                  exitCode: 0,
                  stdout: async () => "",
                  stderr: async () => "",
                }),
                updateNetworkPolicy: async () => {},
                stop: async () => {},
              }
            : null,
      },
      credentials,
      hostEnv: {},
      previewTtlMs: 60_000,
      providerTimeoutMs: 15 * 60_000,
      log: () => {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failedStage).toBe("creating_sandbox");
      expect(result.diagnostics).toMatch(/already existed/);
    }
  });

  it("surfaces cancelRequested from claim renewal", async () => {
    const { factory } = createFakeSandboxFactory();
    const runner = createRunner();
    let renewals = 0;
    runner.renewClaim = async () => {
      renewals += 1;
      return { ok: true, cancelRequested: renewals > 2 };
    };
    const result = await provisionRun({
      claim: baseClaim(),
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
});
