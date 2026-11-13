import { describe, expect, it, vi } from "vitest";
import { runNodeVersionInSandbox, type SandboxFactory } from "./runSandboxJob";

function createFactory(overrides?: {
  createError?: Error;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  stopError?: Error;
}): {
  factory: SandboxFactory;
  stop: ReturnType<typeof vi.fn>;
  runCommand: ReturnType<typeof vi.fn>;
} {
  const stop = vi.fn(async () => {
    if (overrides?.stopError) {
      throw overrides.stopError;
    }
  });
  const runCommand = vi.fn(async () => ({
    exitCode: overrides?.exitCode ?? 0,
    stdout: async () => overrides?.stdout ?? "v22.11.0\n",
    stderr: async () => overrides?.stderr ?? "",
  }));

  const factory: SandboxFactory = {
    create: vi.fn(async (params) => {
      if (overrides?.createError) {
        throw overrides.createError;
      }
      return {
        name: params.name,
        runCommand,
        stop,
      };
    }),
  };

  return { factory, stop, runCommand };
}

describe("runNodeVersionInSandbox", () => {
  const credentials = {
    token: "token",
    teamId: "team",
    projectId: "project",
  };

  it("runs node -v, stores stdout, and stops the sandbox", async () => {
    const { factory, stop, runCommand } = createFactory();
    const onCreated = vi.fn(async () => undefined);

    const result = await runNodeVersionInSandbox({
      factory,
      credentials,
      sandboxName: "patch-job",
      onCreated,
    });

    expect(factory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "patch-job",
        token: "token",
        teamId: "team",
        projectId: "project",
        persistent: false,
        networkPolicy: "deny-all",
      }),
    );
    expect(onCreated).toHaveBeenCalledWith("patch-job");
    expect(runCommand).toHaveBeenCalledWith("node", ["-v"], {
      timeoutMs: expect.any(Number),
    });
    expect(stop).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: true,
      sandboxName: "patch-job",
      exitCode: 0,
      stdout: "v22.11.0\n",
      stderr: "",
      stopError: undefined,
    });
  });

  it("marks non-zero exits as failures and still stops", async () => {
    const { factory, stop } = createFactory({
      exitCode: 1,
      stderr: "node: not found\n",
    });

    const result = await runNodeVersionInSandbox({
      factory,
      credentials,
      sandboxName: "patch-job",
    });

    expect(stop).toHaveBeenCalledOnce();
    expect(result).toEqual({
      ok: false,
      sandboxName: "patch-job",
      exitCode: 1,
      stdout: "v22.11.0\n",
      stderr: "node: not found\n",
      error: "node: not found",
      stopError: undefined,
    });
  });

  it("records create errors without calling stop", async () => {
    const { factory, stop } = createFactory({
      createError: new Error("credential rejected"),
    });

    const result = await runNodeVersionInSandbox({
      factory,
      credentials,
      sandboxName: "patch-job",
    });

    expect(stop).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      sandboxName: undefined,
      error: "credential rejected",
      stopError: undefined,
    });
  });

  it("keeps command success when stop fails", async () => {
    const { factory } = createFactory({
      stopError: new Error("stop timeout"),
    });

    const result = await runNodeVersionInSandbox({
      factory,
      credentials,
      sandboxName: "patch-job",
    });

    expect(result).toMatchObject({
      ok: true,
      stdout: "v22.11.0\n",
      stopError: "stop timeout",
    });
  });
});

describe("readSandboxCredentials", () => {
  it("requires token, team id, and project id", async () => {
    const { readSandboxCredentials } = await import("./sandboxCredentials");
    expect(() => readSandboxCredentials({})).toThrow(/Missing Vercel sandbox credentials/);
    expect(
      readSandboxCredentials({
        VERCEL_TOKEN: "t",
        VERCEL_TEAM_ID: "team",
        VERCEL_PROJECT_ID: "proj",
      }),
    ).toEqual({
      token: "t",
      teamId: "team",
      projectId: "proj",
    });
  });
});
