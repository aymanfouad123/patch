import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth, createAuthOptions } from "./auth";
import { createTestConvex, OWNER_GITHUB_ID } from "./test.setup";

describe("createAuth configuration", () => {
  const previous = {
    SITE_URL: process.env.SITE_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    PATCH_OWNER_GITHUB_ID: process.env.PATCH_OWNER_GITHUB_ID,
  };

  beforeEach(() => {
    process.env.SITE_URL = "http://localhost:3000";
    process.env.GITHUB_CLIENT_ID = "test-client-id";
    process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
    process.env.BETTER_AUTH_SECRET = "test-secret-at-least-32-characters-long";
    process.env.PATCH_OWNER_GITHUB_ID = OWNER_GITHUB_ID;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("disables email/password and only configures GitHub", async () => {
    const { t } = createTestConvex();
    await t.run(async (ctx) => {
      const options = createAuthOptions(ctx);
      expect(options.emailAndPassword?.enabled).toBe(false);
      expect(options.socialProviders?.github).toBeDefined();
      expect(Object.keys(options.socialProviders ?? {})).toEqual(["github"]);
      expect(options.account?.accountLinking?.enabled).toBe(false);
    });
  });

  it("rejects email signup and leaves the user table empty", async () => {
    const { t, component } = createTestConvex();
    await t.run(async (ctx) => {
      const auth = createAuth(ctx);
      await expect(
        auth.api.signUpEmail({
          body: {
            name: "Intruder",
            email: "intruder@example.com",
            password: "password1234",
          },
        }),
      ).rejects.toThrow();
    });

    const users = await t.run(async (ctx) => {
      return await ctx.runQuery(component.adapter.findMany, {
        model: "user",
        paginationOpts: { numItems: 10, cursor: null },
      });
    });
    expect(users.page).toHaveLength(0);
  });
});
