import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, OWNER_GITHUB_ID } from "./test.setup";

async function ownerFixture() {
  const { t, component } = createTestConvex();
  const now = Date.now();
  const user = await t.run((ctx) =>
    ctx.runMutation(component.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Owner",
          email: "owner-environment@example.com",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  await t.run((ctx) =>
    ctx.runMutation(component.adapter.create, {
      input: {
        model: "account",
        data: {
          accountId: OWNER_GITHUB_ID,
          providerId: "github",
          userId: user._id,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  const session = await t.run((ctx) =>
    ctx.runMutation(component.adapter.create, {
      input: {
        model: "session",
        data: {
          token: `environment-${user._id}`,
          userId: user._id,
          expiresAt: now + 60_000,
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  );
  return {
    t,
    asOwner: t.withIdentity({
      subject: user._id as string,
      sessionId: session._id as string,
    }),
  };
}

describe("environment profile", () => {
  beforeEach(() => {
    process.env.PATCH_OWNER_GITHUB_ID = OWNER_GITHUB_ID;
    process.env.PATCH_REPO_URL = "https://github.com/example/patch.git";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    delete process.env.PATCH_OWNER_GITHUB_ID;
    delete process.env.PATCH_REPO_URL;
    delete process.env.PATCH_DEV_NEXT_PUBLIC_CONVEX_URL;
  });

  it("requires owner authentication", async () => {
    const { t } = createTestConvex();
    await expect(t.query(api.environment.getEnvironment, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
    await expect(
      t.mutation(api.environment.saveEnvironmentProfile, {
        installCommand: "pnpm install",
        startCommand: "pnpm dev",
        port: 3000,
        healthPath: "/",
        previewMode: true,
        variables: [],
      }),
    ).rejects.toMatchObject({ data: { code: "UNAUTHENTICATED" } });
  });

  it("saves approved names and exposes status but never values", async () => {
    process.env.PATCH_DEV_NEXT_PUBLIC_CONVEX_URL = "https://secret-dev.example";
    const { asOwner } = await ownerFixture();
    await asOwner.mutation(api.environment.saveEnvironmentProfile, {
      installCommand: "pnpm install",
      startCommand: "pnpm dev",
      port: 3000,
      healthPath: "/",
      previewMode: false,
      variables: ["NEXT_PUBLIC_CONVEX_URL"],
    });
    const profile = await asOwner.query(api.environment.getEnvironment, {});
    expect(profile.variables).toEqual([{ name: "NEXT_PUBLIC_CONVEX_URL", configured: true }]);
    expect(JSON.stringify(profile)).not.toContain("secret-dev.example");
  });

  it("rejects blocked names and missing approved values", async () => {
    const { asOwner } = await ownerFixture();
    await expect(
      asOwner.mutation(api.environment.saveEnvironmentProfile, {
        installCommand: "pnpm install",
        startCommand: "pnpm dev",
        port: 3000,
        healthPath: "/",
        previewMode: false,
        variables: ["VERCEL_TOKEN"],
      }),
    ).rejects.toThrow("not allowed");

    await asOwner.mutation(api.environment.saveEnvironmentProfile, {
      installCommand: "pnpm install",
      startCommand: "pnpm dev",
      port: 3000,
      healthPath: "/",
      previewMode: false,
      variables: ["NEXT_PUBLIC_CONVEX_URL"],
    });
    await expect(asOwner.mutation(api.environment.prepareEnvironment, {})).rejects.toMatchObject({
      data: {
        code: "MISSING_VARIABLES",
        names: ["NEXT_PUBLIC_CONVEX_URL"],
      },
    });
  });
  function mockDiscovery() {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes("/commits/")) return Response.json({ sha: "abc123" });
      if (url.includes("/git/trees/"))
        return Response.json({
          tree: [
            { type: "blob", path: "package.json" },
            { type: "blob", path: "pnpm-lock.yaml" },
            { type: "blob", path: ".env.local" },
          ],
        });
      return new Response(
        JSON.stringify({ packageManager: "pnpm@12.8.1", scripts: { dev: "next dev" } }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  it("discovers anonymously, requires Save, then queues credential-free preview preparation", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    const fetch = mockDiscovery();
    const { asOwner, t } = await ownerFixture();
    await expect(asOwner.mutation(api.environment.prepareEnvironment, {})).rejects.toThrow("save");
    await asOwner.action(api.environment.discoverEnvironment, {});
    const draft = await asOwner.query(api.environment.getEnvironment, {});
    expect(draft.version).toBe(0);
    await expect(asOwner.mutation(api.environment.prepareEnvironment, {})).rejects.toThrow("save");
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(fetch.mock.calls[1][0]).toContain("/git/trees/abc123?recursive=1");
    expect(fetch.mock.calls.some(([url]) => url.includes(".env.local"))).toBe(false);
    await asOwner.mutation(api.environment.saveEnvironmentProfile, {
      installCommand: draft.installCommand,
      startCommand: draft.startCommand,
      port: draft.port,
      healthPath: draft.healthPath,
      previewMode: true,
      variables: ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_CONVEX_SITE_URL"],
    });
    const id = await asOwner.mutation(api.environment.prepareEnvironment, {});
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      purpose: "prepare",
      profileVersion: 1,
      status: "queued",
    });
    expect(await asOwner.query(api.environment.getEnvironment, {})).toMatchObject({
      status: "preparing",
    });
  });

  it("uses existing OAuth app credentials only on server-side API GETs", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "client-secret");
    const fetch = mockDiscovery();
    const { asOwner } = await ownerFixture();
    const result = await asOwner.action(api.environment.discoverEnvironment, {});
    for (const [url, options] of fetch.mock.calls) {
      if (url.startsWith("https://api.github.com/")) {
        expect(options.headers.Authorization).toBe(`Basic ${btoa("client-id:client-secret")}`);
        expect(options.method ?? "GET").toBe("GET");
      } else {
        expect(options).toBeUndefined();
      }
    }
    expect(JSON.stringify(result)).not.toContain("client-secret");
  });

  it.each([
    [403, "0", "API rate limit exceeded", "anonymous rate limit reached"],
    [403, "40", "secondary rate limit exceeded", "rate limit reached"],
    [403, "40", "Resource not accessible", "Resource not accessible"],
    [401, "40", "Bad credentials", "Bad credentials"],
  ])(
    "preserves GitHub %s diagnostics and actionable messages",
    async (status, remaining, message, expected) => {
      vi.stubEnv("GITHUB_CLIENT_ID", "");
      vi.stubEnv("GITHUB_CLIENT_SECRET", "");
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ message }), {
              status,
              headers: {
                "x-ratelimit-limit": "60",
                "x-ratelimit-remaining": remaining,
                "x-ratelimit-reset": "1794536301",
                "retry-after": "60",
              },
            }),
        ),
      );
      const { asOwner } = await ownerFixture();
      await expect(asOwner.action(api.environment.discoverEnvironment, {})).rejects.toMatchObject({
        data: {
          code: "GITHUB_DISCOVERY_FAILED",
          status,
          message: expect.stringContaining(expected),
          rateLimit: { "x-ratelimit-remaining": remaining },
          body: JSON.stringify({ message }),
        },
      });
      expect((await asOwner.query(api.environment.getEnvironment, {})).version).toBe(0);
    },
  );
});
