import { describe, expect, it } from "vitest";
import type { RunnerClaim, RunnerClient } from "../convex";
import { createFakeSandboxFactory } from "../sandbox/fake";
import { cleanupRun } from "./cleanup";

function claim(overrides: Partial<RunnerClaim> = {}): RunnerClaim {
  return {
    runId: "runs_1",
    claimId: "claim-1",
    status: "cleaning",
    cancelRequested: false,
    repoUrl: "https://github.com/example/fixture.git",
    commitSha: "abcdef1234567890abcdef1234567890abcdef12",
    workingDirectory: ".",
    installCommand: "pnpm install",
    startCommand: "pnpm dev",
    port: 3000,
    healthPath: "/",
    previewMode: true,
    variableNames: [],
    profileVersion: 1,
    sandboxName: "patch-run-runs_1",
    createStartedAt: Date.now() - 120_000,
    terminalOutcome: "failed",
    cleanupAttempts: 0,
    ...overrides,
  };
}

describe("cleanupRun", () => {
  it("stops a live sandbox and marks cleaned", async () => {
    const { factory, stopped } = createFakeSandboxFactory();
    await factory.create({
      name: "patch-run-runs_1",
      credentials: { token: "t", teamId: "team", projectId: "project" },
      port: 3000,
      timeoutMs: 1000,
      creationEnv: {},
    });
    let cleaned: { outcome: string; cleanupError?: string } | undefined;
    const runner: RunnerClient = {
      claimNext: async () => null,
      renewClaim: async () => ({ ok: true, cancelRequested: false }),
      recordStage: async () => true,
      recordSandbox: async () => true,
      markReady: async () => true,
      markFailed: async () => true,
      markCleaned: async (args) => {
        cleaned = args;
        return true;
      },
      sweep: async () => ({ swept: 0 }),
    };
    const result = await cleanupRun({
      claim: claim(),
      runner,
      factory,
      credentials: { token: "t", teamId: "team", projectId: "project" },
      log: () => {},
    });
    expect(stopped).toEqual(["patch-run-runs_1"]);
    expect(result.done).toBe(true);
    expect(cleaned).toMatchObject({ outcome: "failed" });
  });

  it("treats a missing sandbox as success", async () => {
    const { factory } = createFakeSandboxFactory();
    const runner: RunnerClient = {
      claimNext: async () => null,
      renewClaim: async () => ({ ok: true, cancelRequested: false }),
      recordStage: async () => true,
      recordSandbox: async () => true,
      markReady: async () => true,
      markFailed: async () => true,
      markCleaned: async () => true,
      sweep: async () => ({ swept: 0 }),
    };
    const result = await cleanupRun({
      claim: claim({ terminalOutcome: "cancelled" }),
      runner,
      factory,
      credentials: { token: "t", teamId: "team", projectId: "project" },
      log: () => {},
    });
    expect(result).toMatchObject({ done: true, outcome: "cancelled" });
  });
});
