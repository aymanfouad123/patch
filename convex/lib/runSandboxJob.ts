export type CreatedSandbox = {
  name: string;
  runCommand: (
    command: string,
    args?: string[],
    opts?: { timeoutMs?: number },
  ) => Promise<{
    exitCode: number;
    stdout: () => Promise<string>;
    stderr: () => Promise<string>;
  }>;
  stop: () => Promise<unknown>;
};

export type SandboxFactory = {
  create: (params: {
    name: string;
    token: string;
    teamId: string;
    projectId: string;
    persistent: false;
    networkPolicy: "deny-all";
    resources: { vcpus: number };
    timeout: number;
  }) => Promise<CreatedSandbox>;
};

export type RunSandboxJobResult =
  | {
      ok: true;
      sandboxName: string;
      exitCode: number;
      stdout: string;
      stderr: string;
      stopError?: string;
    }
  | {
      ok: false;
      sandboxName?: string;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      error: string;
      stopError?: string;
    };

export const SANDBOX_SESSION_TIMEOUT_MS = 60_000;
export const COMMAND_TIMEOUT_MS = 30_000;

export async function runNodeVersionInSandbox(params: {
  factory: SandboxFactory;
  credentials: {
    token: string;
    teamId: string;
    projectId: string;
  };
  sandboxName: string;
  onCreated?: (sandboxName: string) => Promise<void>;
}): Promise<RunSandboxJobResult> {
  let sandbox: CreatedSandbox | undefined;
  let stopError: string | undefined;
  let commandResult:
    | {
        ok: true;
        exitCode: number;
        stdout: string;
        stderr: string;
      }
    | {
        ok: false;
        exitCode?: number;
        stdout?: string;
        stderr?: string;
        error: string;
      }
    | undefined;

  try {
    sandbox = await params.factory.create({
      name: params.sandboxName,
      token: params.credentials.token,
      teamId: params.credentials.teamId,
      projectId: params.credentials.projectId,
      persistent: false,
      networkPolicy: "deny-all",
      resources: { vcpus: 2 },
      timeout: SANDBOX_SESSION_TIMEOUT_MS,
    });

    if (params.onCreated) {
      await params.onCreated(sandbox.name);
    }

    const result = await sandbox.runCommand("node", ["-v"], {
      timeoutMs: COMMAND_TIMEOUT_MS,
    });
    const stdout = await result.stdout();
    const stderr = await result.stderr();

    if (result.exitCode !== 0) {
      commandResult = {
        ok: false,
        exitCode: result.exitCode,
        stdout,
        stderr,
        error: stderr.trim() || `Command exited with code ${result.exitCode}`,
      };
    } else {
      commandResult = {
        ok: true,
        exitCode: result.exitCode,
        stdout,
        stderr,
      };
    }
  } catch (error) {
    commandResult = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (sandbox) {
      try {
        await sandbox.stop();
      } catch (error) {
        stopError = error instanceof Error ? error.message : String(error);
      }
    }
  }

  if (!commandResult) {
    return {
      ok: false,
      sandboxName: sandbox?.name,
      error: "Sandbox job ended without a result",
      stopError,
    };
  }

  if (commandResult.ok) {
    return {
      ok: true,
      sandboxName: sandbox!.name,
      exitCode: commandResult.exitCode,
      stdout: commandResult.stdout,
      stderr: commandResult.stderr,
      stopError,
    };
  }

  return {
    ok: false,
    sandboxName: sandbox?.name,
    exitCode: commandResult.exitCode,
    stdout: commandResult.stdout,
    stderr: commandResult.stderr,
    error: commandResult.error,
    stopError,
  };
}
