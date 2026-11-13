import { Sandbox } from "@vercel/sandbox";
import type { SandboxCredentials } from "./credentials";
import type { SandboxFactory, SandboxHandle } from "./types";

function wrap(sandbox: Sandbox): SandboxHandle {
  return {
    name: sandbox.name,
    cwd: sandbox.cwd,
    sandboxId: sandbox.currentSession().sessionId,
    expiresAt: sandbox.expiresAt,
    domain: (port) => sandbox.domain(port),
    runCommand: (params) => sandbox.runCommand(params),
    updateNetworkPolicy: (policy) => sandbox.updateNetworkPolicy(policy),
    stop: (opts) => sandbox.stop(opts),
  };
}

export function createVercelSandboxFactory(): SandboxFactory {
  return {
    create: async ({ name, credentials, port, timeoutMs, creationEnv, signal }) => {
      const sandbox = await Sandbox.create({
        ...credentials,
        name,
        image: "vercel/sandbox/node:24",
        persistent: false,
        timeout: timeoutMs,
        resources: { vcpus: 2 },
        ports: [port],
        networkPolicy: { allow: ["github.com", "*.githubusercontent.com"] },
        signal,
        env: creationEnv,
      });
      return wrap(sandbox);
    },
    get: async ({ name, credentials, signal }) => {
      try {
        const sandbox = await Sandbox.get({
          ...credentials,
          name,
          resume: false,
          signal,
        });
        if (["stopped", "failed"].includes(sandbox.status)) return null;
        return wrap(sandbox);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/not_found|not found|no active session/i.test(message)) return null;
        throw error;
      }
    },
  };
}

export type { SandboxCredentials };
