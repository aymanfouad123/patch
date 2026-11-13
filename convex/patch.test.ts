import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import { createTestConvex, OWNER_GITHUB_ID } from "./test.setup";

type Fixture = {
  userId: string;
  sessionId: string;
};

async function seedUser(
  component: ReturnType<typeof createTestConvex>["component"],
  t: ReturnType<typeof createTestConvex>["t"],
  opts: { githubAccountId: string; name?: string; email?: string },
): Promise<Fixture> {
  const now = Date.now();
  const user = await t.run(async (ctx) => {
    return await ctx.runMutation(component.adapter.create, {
      input: {
        model: "user",
        data: {
          name: opts.name ?? "Owner",
          email: opts.email ?? "owner@example.com",
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  });

  await t.run(async (ctx) => {
    await ctx.runMutation(component.adapter.create, {
      input: {
        model: "account",
        data: {
          accountId: opts.githubAccountId,
          providerId: "github",
          userId: user._id,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
  });

  const session = await t.run(async (ctx) => {
    return await ctx.runMutation(component.adapter.create, {
      input: {
        model: "session",
        data: {
          expiresAt: now + 60 * 60 * 1000,
          token: `token-${user._id}`,
          createdAt: now,
          updatedAt: now,
          userId: user._id,
        },
      },
    });
  });

  return { userId: user._id as string, sessionId: session._id as string };
}

describe("patch authorization", () => {
  const previousOwner = process.env.PATCH_OWNER_GITHUB_ID;

  beforeEach(() => {
    process.env.PATCH_OWNER_GITHUB_ID = OWNER_GITHUB_ID;
  });

  afterEach(() => {
    if (previousOwner === undefined) delete process.env.PATCH_OWNER_GITHUB_ID;
    else process.env.PATCH_OWNER_GITHUB_ID = previousOwner;
  });

  it("rejects unauthenticated getSession calls", async () => {
    const { t } = createTestConvex();
    await expect(t.query(api.patch.getSession, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
    await expect(t.query(api.patch.getViewer, {})).resolves.toEqual({
      status: "signedOut",
    });
  });

  it("rejects a signed-in user with the wrong GitHub identity", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: "999999",
      name: "Intruder",
      email: "intruder@example.com",
    });

    const asUser = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    await expect(asUser.query(api.patch.getSession, {})).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    await expect(asUser.query(api.patch.getViewer, {})).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("allows the configured owner", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
      name: "Owner",
    });

    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    await expect(asOwner.query(api.patch.getSession, {})).resolves.toEqual({
      user: { name: "Owner", image: null },
    });
    await expect(asOwner.query(api.patch.getViewer, {})).resolves.toEqual({
      status: "authorized",
      user: { name: "Owner", image: null },
    });
  });

  it("fails closed when PATCH_OWNER_GITHUB_ID is missing", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
    });
    delete process.env.PATCH_OWNER_GITHUB_ID;

    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    await expect(asOwner.query(api.patch.getSession, {})).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    await expect(asOwner.query(api.patch.getViewer, {})).resolves.toEqual({
      status: "unauthorized",
    });
  });

  it("revokes access after sign-out deletes the session", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
    });

    await t.run(async (ctx) => {
      await ctx.runMutation(component.adapter.deleteOne, {
        input: {
          model: "session",
          where: [{ field: "_id", value: fixture.sessionId }],
        },
      });
    });

    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    await expect(asOwner.query(api.patch.getSession, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
    await expect(asOwner.query(api.patch.getViewer, {})).resolves.toEqual({
      status: "signedOut",
    });
  });
});
