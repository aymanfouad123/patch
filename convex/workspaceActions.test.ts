import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "./schema";
import { internal } from "./_generated/api";
const mocks = vi.hoisted(() => ({ create: vi.fn(), get: vi.fn() }));
vi.mock("@vercel/sandbox", () => ({ Sandbox: mocks }));
const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts", "!./test.setup.ts"]);
describe("workspace provisioning", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_TOKEN", "secret");
    vi.stubEnv("VERCEL_TEAM_ID", "team");
    vi.stubEnv("VERCEL_PROJECT_ID", "project");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });
  async function fixture(failCommand?: string) {
    const t = convexTest(schema, modules);
    const id = await t.run((ctx) =>
      ctx.db.insert("workspaces", {
        ownerUserId: "owner",
        repoUrl: "https://github.com/example/patch.git",
        status: "queued",
        active: true,
        sandboxName: "test-workspace",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const sandbox = {
      cwd: "/vercel/sandbox",
      expiresAt: new Date(Date.now() + 900_000),
      currentSession: () => ({ sessionId: "session-id" }),
      stop: vi.fn(),
      domain: vi.fn(() => "https://preview.example"),
      updateNetworkPolicy: vi.fn(),
      runCommand: vi.fn(async (params: { cmd: string; args: string[] }) => ({
        exitCode: params.cmd === failCommand ? 1 : 0,
        stdout: async () => (params.args.includes("-p") ? "pnpm@12.8.1" : "abc123"),
        stderr: async () => "failure detail",
      })),
    };
    mocks.create.mockResolvedValue(sandbox);
    return { t, id, sandbox };
  }
  it("persists a live preview without stopping or forwarding credentials", async () => {
    const { t, id, sandbox } = await fixture();
    await t.action(internal.workspaceActions.provision, { id });
    expect(await t.query(internal.workspaces.get, { id })).toMatchObject({
      status: "ready",
      commitSha: "abc123",
      sandboxId: "session-id",
      previewUrl: "https://preview.example",
      active: true,
    });
    expect(sandbox.stop).not.toHaveBeenCalled();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      persistent: false,
      ports: [3000],
      timeout: 900_000,
      env: { PATCH_PREVIEW_MODE: "1" },
    });
    expect(mocks.create.mock.calls[0][0].env).not.toHaveProperty("VERCEL_TOKEN");
    expect(
      sandbox.runCommand.mock.calls.some(([p]) => (p as { detached?: boolean }).detached),
    ).toBe(true);
    expect(sandbox.updateNetworkPolicy).toHaveBeenCalledWith("deny-all");
  });
  it.each(["git", "npm", "sh", "node"])("cleans up on %s failure", async (cmd) => {
    const { t, id, sandbox } = await fixture(cmd);
    await t.action(internal.workspaceActions.provision, { id });
    expect(sandbox.stop).toHaveBeenCalled();
    expect(await t.query(internal.workspaces.get, { id })).toMatchObject({
      status: "stopping",
      terminalStatus: "failed",
    });
  });

  it("injects approved values only into start and verifies the profile", async () => {
    vi.stubEnv("PATCH_DEV_NEXT_PUBLIC_CONVEX_URL", "https://dev.convex.cloud");
    vi.stubEnv("PATCH_DEV_NEXT_PUBLIC_CONVEX_SITE_URL", "https://dev.convex.site");
    const { t, id, sandbox } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { purpose: "prepare", profileVersion: 1 });
      await ctx.db.insert("environmentProfiles", {
        singleton: "project",
        repoUrl: "https://github.com/example/patch.git",
        installCommand: "pnpm install --frozen-lockfile",
        startCommand: "pnpm dev --hostname 0.0.0.0 --port 3000",
        port: 3000,
        healthPath: "/",
        previewMode: false,
        variables: [
          {
            name: "NEXT_PUBLIC_CONVEX_URL",
            source: "PATCH_DEV_NEXT_PUBLIC_CONVEX_URL",
          },
          {
            name: "NEXT_PUBLIC_CONVEX_SITE_URL",
            source: "PATCH_DEV_NEXT_PUBLIC_CONVEX_SITE_URL",
          },
        ],
        version: 1,
        status: "preparing",
        updatedAt: Date.now(),
      });
    });

    await t.action(internal.workspaceActions.provision, { id });

    expect(mocks.create.mock.calls[0][0].env).toEqual({
      NEXT_TELEMETRY_DISABLED: "1",
    });
    const calls = sandbox.runCommand.mock.calls.map(([params]) => params);
    const start = calls.find((params) => params.detached);
    expect(start.env).toMatchObject({
      NEXT_PUBLIC_CONVEX_URL: "https://dev.convex.cloud",
      NEXT_PUBLIC_CONVEX_SITE_URL: "https://dev.convex.site",
    });
    for (const params of calls.filter((params) => !params.detached)) {
      expect(JSON.stringify(params)).not.toContain("dev.convex");
    }
    expect(sandbox.updateNetworkPolicy.mock.calls).toEqual([
      [{ allow: ["registry.npmjs.org"] }],
      [{ allow: ["dev.convex.cloud", "dev.convex.site"] }],
    ]);
    const profile = await t.run((ctx) =>
      ctx.db
        .query("environmentProfiles")
        .withIndex("by_singleton", (q) => q.eq("singleton", "project"))
        .unique(),
    );
    expect(profile).toMatchObject({
      status: "ready",
      latestCommitSha: "abc123",
      verified: { version: 1, commitSha: "abc123" },
    });
  });

  it("verifies a preview profile without application credentials or forwarding GitHub credentials", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "private-client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "private-client-secret");
    vi.stubEnv("PATCH_DEV_NEXT_PUBLIC_CONVEX_URL", "");
    vi.stubEnv("PATCH_DEV_NEXT_PUBLIC_CONVEX_SITE_URL", "");
    const { t, id, sandbox } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { purpose: "prepare", profileVersion: 1 });
      await ctx.db.insert("environmentProfiles", {
        singleton: "project",
        repoUrl: "https://github.com/example/patch.git",
        installCommand: "pnpm install --frozen-lockfile",
        startCommand: "pnpm dev --hostname 0.0.0.0 --port 3000",
        port: 3000,
        healthPath: "/",
        previewMode: true,
        variables: [{ name: "NEXT_PUBLIC_CONVEX_URL", source: "PATCH_DEV_NEXT_PUBLIC_CONVEX_URL" }],
        version: 1,
        status: "preparing",
        updatedAt: Date.now(),
      });
    });
    await t.action(internal.workspaceActions.provision, { id });
    expect(await t.query(internal.workspaces.get, { id })).toMatchObject({ status: "ready" });
    expect(await t.query(internal.environment.getForProvision, {})).toMatchObject({
      status: "ready",
      verified: { version: 1, commitSha: "abc123" },
    });
    expect(mocks.create.mock.calls[0][0].env).toEqual({
      NEXT_TELEMETRY_DISABLED: "1",
      PATCH_PREVIEW_MODE: "1",
    });
    expect(JSON.stringify(sandbox.runCommand.mock.calls)).not.toMatch(
      /private-client|CONVEX_URL|CONVEX_SITE_URL/,
    );
    expect(sandbox.updateNetworkPolicy).toHaveBeenLastCalledWith("deny-all");
  });

  it("fails before sandbox creation when approved configuration is missing", async () => {
    const { t, id } = await fixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { purpose: "prepare", profileVersion: 1 });
      await ctx.db.insert("environmentProfiles", {
        singleton: "project",
        repoUrl: "https://github.com/example/patch.git",
        installCommand: "pnpm install",
        startCommand: "pnpm dev",
        port: 3000,
        healthPath: "/",
        previewMode: false,
        variables: [
          {
            name: "NEXT_PUBLIC_CONVEX_URL",
            source: "PATCH_DEV_NEXT_PUBLIC_CONVEX_URL",
          },
        ],
        version: 1,
        status: "preparing",
        verified: {
          version: 1,
          commitSha: "last-working",
          config: {
            repoUrl: "https://github.com/example/patch.git",
            installCommand: "pnpm install",
            startCommand: "pnpm dev",
            port: 3000,
            healthPath: "/",
            previewMode: false,
            variables: [
              {
                name: "NEXT_PUBLIC_CONVEX_URL",
                source: "PATCH_DEV_NEXT_PUBLIC_CONVEX_URL",
              },
            ],
          },
          durationMs: 1000,
          verifiedAt: Date.now() - 1000,
        },
        updatedAt: Date.now(),
      });
    });
    await t.action(internal.workspaceActions.provision, { id });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(await t.query(internal.workspaces.get, { id })).toMatchObject({
      terminalStatus: "failed",
    });
    const profile = await t.run((ctx) =>
      ctx.db
        .query("environmentProfiles")
        .withIndex("by_singleton", (q) => q.eq("singleton", "project"))
        .unique(),
    );
    expect(profile).toMatchObject({
      status: "failed",
      lastMissingVariables: ["NEXT_PUBLIC_CONVEX_URL"],
      verified: { commitSha: "last-working" },
    });
  });
});
