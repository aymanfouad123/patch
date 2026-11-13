export type SandboxHandle = {
  name: string;
  cwd: string;
  sandboxId: string;
  expiresAt?: Date;
  domain: (port: number) => string;
  runCommand: (params: {
    cmd: string;
    args?: string[];
    cwd?: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    detached?: boolean;
  }) => Promise<{
    exitCode: number;
    stdout: () => Promise<string>;
    stderr: () => Promise<string>;
  }>;
  updateNetworkPolicy: (
    policy: { allow: string[] } | "deny-all",
  ) => Promise<unknown>;
  stop: (opts?: { signal?: AbortSignal }) => Promise<unknown>;
};

export type SandboxFactory = {
  create: (params: {
    name: string;
    credentials: { token: string; teamId: string; projectId: string };
    port: number;
    timeoutMs: number;
    creationEnv: Record<string, string>;
    signal?: AbortSignal;
  }) => Promise<SandboxHandle>;
  get: (params: {
    name: string;
    credentials: { token: string; teamId: string; projectId: string };
    signal?: AbortSignal;
  }) => Promise<SandboxHandle | null>;
};
