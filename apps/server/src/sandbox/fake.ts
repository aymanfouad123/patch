import type { SandboxFactory, SandboxHandle } from "./types";

export type FakeSandboxOptions = {
  failAt?: "create" | "clone" | "install" | "start" | "health";
  healthLog?: string;
  existingNames?: Set<string>;
  createDelayMs?: number;
  onStop?: (name: string) => void;
};

export function createFakeSandboxFactory(options: FakeSandboxOptions = {}): {
  factory: SandboxFactory;
  stopped: string[];
  created: string[];
} {
  const stopped: string[] = [];
  const created: string[] = [];
  const live = new Map<string, SandboxHandle>();
  const existing = options.existingNames ?? new Set<string>();

  const factory: SandboxFactory = {
    create: async ({ name, port, signal }) => {
      if (options.createDelayMs) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, options.createDelayMs);
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new Error("aborted"));
          });
        });
      }
      if (options.failAt === "create") throw new Error("create failed");
      if (existing.has(name) || live.has(name)) {
        throw new Error(`sandbox ${name} already exists`);
      }
      created.push(name);
      const handle: SandboxHandle = {
        name,
        cwd: "/tmp/sandbox",
        sandboxId: `session-${name}`,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        domain: (p) => `https://${name}-${p}.vercel.run`,
        updateNetworkPolicy: async () => {},
        stop: async () => {
          stopped.push(name);
          live.delete(name);
          options.onStop?.(name);
        },
        runCommand: async ({ cmd, args = [] }) => {
          const joined = [cmd, ...args].join(" ");
          if (joined.includes("clone") && options.failAt === "clone") {
            return fail("clone failed");
          }
          if (joined.includes("fetch") && options.failAt === "clone") {
            return fail("fetch failed");
          }
          if (joined.includes("packageManager")) {
            return ok("pnpm@12.8.1");
          }
          if (joined.includes("install") && options.failAt === "install") {
            return fail("install failed");
          }
          if (joined.includes("exec ") && options.failAt === "start") {
            return fail("start failed");
          }
          if (joined.includes("127.0.0.1") && options.failAt === "health") {
            return fail(options.healthLog ?? "readiness failed\nMissing environment variable DEMO_SECRET");
          }
          if (joined.includes("tail")) {
            return ok(options.healthLog ?? "");
          }
          if (joined.includes("domain") || joined.includes("checkout") || joined.includes("rev-parse")) {
            return ok("ok");
          }
          return ok(`ran:${joined}`);
          function ok(stdout: string) {
            return {
              exitCode: 0,
              stdout: async () => stdout,
              stderr: async () => "",
            };
          }
          function fail(stderr: string) {
            return {
              exitCode: 1,
              stdout: async () => "",
              stderr: async () => stderr,
            };
          }
        },
      };
      // silence unused
      void port;
      live.set(name, handle);
      existing.add(name);
      return handle;
    },
    get: async ({ name }) => live.get(name) ?? null,
  };

  return { factory, stopped, created };
}
