import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
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

describe("sandbox jobs", () => {
  const previousOwner = process.env.PATCH_OWNER_GITHUB_ID;

  beforeEach(() => {
    process.env.PATCH_OWNER_GITHUB_ID = OWNER_GITHUB_ID;
  });

  afterEach(() => {
    if (previousOwner === undefined) delete process.env.PATCH_OWNER_GITHUB_ID;
    else process.env.PATCH_OWNER_GITHUB_ID = previousOwner;
  });

  it("rejects unauthenticated create and read calls", async () => {
    const { t } = createTestConvex();

    await expect(t.mutation(api.sandbox.createJob, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
    await expect(t.query(api.sandbox.latestJob, {})).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });

  it("rejects non-owner create and read calls", async () => {
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

    await expect(asUser.mutation(api.sandbox.createJob, {})).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
    await expect(asUser.query(api.sandbox.latestJob, {})).rejects.toMatchObject({
      data: { code: "FORBIDDEN" },
    });
  });

  it("creates a queued job for the owner and schedules the runner", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
    });
    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    const created = await asOwner.mutation(api.sandbox.createJob, {});
    const job = await asOwner.query(api.sandbox.getJob, { jobId: created.jobId });

    expect(job).toMatchObject({
      id: created.jobId,
      status: "queued",
      active: true,
    });
    expect(await asOwner.query(api.sandbox.latestJob, {})).toMatchObject({
      id: created.jobId,
      status: "queued",
    });
  });

  it("rejects a second active job and allows another after completion", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
    });
    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    const first = await asOwner.mutation(api.sandbox.createJob, {});
    await expect(asOwner.mutation(api.sandbox.createJob, {})).rejects.toMatchObject({
      data: { code: "JOB_ACTIVE" },
    });

    await t.mutation(internal.sandbox.markStarting, { jobId: first.jobId });
    await t.mutation(internal.sandbox.markRunning, {
      jobId: first.jobId,
      sandboxName: "patch-test",
    });
    await t.mutation(internal.sandbox.markCompleted, {
      jobId: first.jobId,
      stdout: "v22.0.0\n",
      exitCode: 0,
    });

    const second = await asOwner.mutation(api.sandbox.createJob, {});
    expect(second.jobId).not.toEqual(first.jobId);
    expect(await asOwner.query(api.sandbox.latestJob, {})).toMatchObject({
      id: second.jobId,
      status: "queued",
      active: true,
    });
  });

  it("advances through success and failure transitions", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
    });
    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    const success = await asOwner.mutation(api.sandbox.createJob, {});
    expect(
      await t.mutation(internal.sandbox.markStarting, { jobId: success.jobId }),
    ).toBe(true);
    expect(
      await t.mutation(internal.sandbox.markRunning, {
        jobId: success.jobId,
        sandboxName: "patch-success",
      }),
    ).toBe(true);
    expect(
      await t.mutation(internal.sandbox.markCompleted, {
        jobId: success.jobId,
        stdout: "v22.11.0\n",
        exitCode: 0,
      }),
    ).toBe(true);
    expect(await asOwner.query(api.sandbox.getJob, { jobId: success.jobId })).toMatchObject({
      status: "completed",
      active: false,
      stdout: "v22.11.0\n",
      exitCode: 0,
      sandboxName: "patch-success",
    });

    const failure = await asOwner.mutation(api.sandbox.createJob, {});
    await t.mutation(internal.sandbox.markStarting, { jobId: failure.jobId });
    expect(
      await t.mutation(internal.sandbox.markFailed, {
        jobId: failure.jobId,
        error: "boom",
        stderr: "denied",
        exitCode: 1,
      }),
    ).toBe(true);
    expect(await asOwner.query(api.sandbox.getJob, { jobId: failure.jobId })).toMatchObject({
      status: "failed",
      active: false,
      error: "boom",
      stderr: "denied",
      exitCode: 1,
    });
  });

  it("hides another owner's job id from getJob", async () => {
    const { t, component } = createTestConvex();
    const owner = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
      email: "owner@example.com",
    });
    const asOwner = t.withIdentity({
      subject: owner.userId,
      sessionId: owner.sessionId,
    });
    const created = await asOwner.mutation(api.sandbox.createJob, {});

    // Simulate a foreign job by rewriting ownership after create.
    await t.run(async (ctx) => {
      await ctx.db.patch(created.jobId, { ownerUserId: "someone-else" });
    });

    await expect(
      asOwner.query(api.sandbox.getJob, { jobId: created.jobId }),
    ).rejects.toMatchObject({
      data: { code: "NOT_FOUND" },
    });
  });

  it("records stop failures without replacing a completed result", async () => {
    const { t, component } = createTestConvex();
    const fixture = await seedUser(component, t, {
      githubAccountId: OWNER_GITHUB_ID,
    });
    const asOwner = t.withIdentity({
      subject: fixture.userId,
      sessionId: fixture.sessionId,
    });

    const created = await asOwner.mutation(api.sandbox.createJob, {});
    await t.mutation(internal.sandbox.markStarting, { jobId: created.jobId });
    await t.mutation(internal.sandbox.markRunning, {
      jobId: created.jobId,
      sandboxName: "patch-stop",
    });
    await t.mutation(internal.sandbox.markCompleted, {
      jobId: created.jobId,
      stdout: "v22.0.0\n",
      exitCode: 0,
    });
    await t.mutation(internal.sandbox.recordStopError, {
      jobId: created.jobId,
      error: "already stopped",
    });

    expect(await asOwner.query(api.sandbox.getJob, { jobId: created.jobId })).toMatchObject({
      status: "completed",
      stdout: "v22.0.0\n",
      error: "stop failed: already stopped",
    });
  });
});
