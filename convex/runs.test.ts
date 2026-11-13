import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { createTestConvex, OWNER_GITHUB_ID } from "./test.setup";

const FIXTURE_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const RUNNER_SECRET = "test-runner-secret";

async function ownerFixture() {
  const { t, component } = createTestConvex();
  const now = Date.now();
  const user = await t.run((ctx) =>
    ctx.runMutation(component.adapter.create, {
      input: {
        model: "user",
        data: {
          name: "Owner",
          email: "owner-runs@example.com",
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
          token: `runs-${user._id}`,
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
    userId: user._id as string,
    asOwner: t.withIdentity({
      subject: user._id as string,
      sessionId: session._id as string,
    }),
  };
}

async function seedFixtureProfile(t: Awaited<ReturnType<typeof createTestConvex>>["t"]) {
  return t.mutation(internal.environment.seedProfile, {
    repoUrl: "https://github.com/example/fixture.git",
    commitSha: FIXTURE_SHA,
    installCommand: "pnpm install --frozen-lockfile",
    startCommand: "pnpm dev --hostname 0.0.0.0 --port 3000",
    port: 3000,
    healthPath: "/",
    previewMode: true,
    workingDirectory: ".",
  });
}

describe("runs", () => {
  beforeEach(() => {
    process.env.PATCH_OWNER_GITHUB_ID = OWNER_GITHUB_ID;
    process.env.PATCH_RUNNER_SECRET = RUNNER_SECRET;
  });

  afterEach(() => {
    delete process.env.PATCH_OWNER_GITHUB_ID;
    delete process.env.PATCH_RUNNER_SECRET;
  });

  it("requires owner authentication for enqueue and get", async () => {
    const { t } = createTestConvex();
    await expect(t.mutation(api.runs.enqueue, { kind: "environment_test" })).rejects.toMatchObject({
      data: { code: "UNAUTHENTICATED" },
    });
  });

  it("rejects enqueue without a pinned profile commit", async () => {
    const { asOwner } = await ownerFixture();
    await expect(
      asOwner.mutation(api.runs.enqueue, { kind: "environment_test" }),
    ).rejects.toThrow(/profile/i);
  });

  it("enqueues a run that snapshots the profile and rejects a second active run", async () => {
    const { t, asOwner } = await ownerFixture();
    await seedFixtureProfile(t);
    const { runId } = await asOwner.mutation(api.runs.enqueue, { kind: "environment_test" });
    const run = await asOwner.query(api.runs.get, { runId });
    expect(run).toMatchObject({
      id: runId,
      status: "queued",
      active: true,
      commitSha: FIXTURE_SHA,
      repoUrl: "https://github.com/example/fixture.git",
      sandboxName: `patch-run-${runId}`,
      previewMode: true,
    });
    expect(run).not.toHaveProperty("claimId");
    await expect(
      asOwner.mutation(api.runs.enqueue, { kind: "environment_test" }),
    ).rejects.toMatchObject({ data: { code: "RUN_ACTIVE" } });
  });

  it("cancels a queued run immediately", async () => {
    const { t, asOwner } = await ownerFixture();
    await seedFixtureProfile(t);
    const { runId } = await asOwner.mutation(api.runs.enqueue, { kind: "environment_test" });
    const cancelled = await asOwner.mutation(api.runs.cancel, { runId });
    expect(cancelled).toMatchObject({ status: "cancelled", active: false });
  });

  it("claims a single winner and fences stale claim writes", async () => {
    const { t, asOwner } = await ownerFixture();
    await seedFixtureProfile(t);
    const { runId } = await asOwner.mutation(api.runs.enqueue, { kind: "environment_test" });

    const first = await t.mutation(internal.runner.claimNext, {
      workerId: "worker-a",
      claimMs: 30_000,
    });
    const second = await t.mutation(internal.runner.claimNext, {
      workerId: "worker-b",
      claimMs: 30_000,
    });
    expect(first).toMatchObject({
      runId,
      status: "provisioning",
      stage: "creating_sandbox",
    });
    expect(second).toBeNull();

    const advanced = await t.mutation(internal.runner.recordStage, {
      runId,
      claimId: first!.claimId,
      stage: "cloning",
    });
    expect(advanced).toBe(true);

    const stale = await t.mutation(internal.runner.recordStage, {
      runId,
      claimId: "not-the-claim",
      stage: "installing",
    });
    expect(stale).toBe(false);

    const skip = await t.mutation(internal.runner.recordStage, {
      runId,
      claimId: first!.claimId,
      stage: "starting",
    });
    expect(skip).toBe(false);
  });

  it("sweeps expired provisioning claims into cleanup_pending", async () => {
    const { t, asOwner } = await ownerFixture();
    await seedFixtureProfile(t);
    const { runId } = await asOwner.mutation(api.runs.enqueue, { kind: "environment_test" });
    const claim = await t.mutation(internal.runner.claimNext, {
      workerId: "worker-a",
      claimMs: 30_000,
    });
    await t.mutation(internal.runner.forceExpireClaim, { runId });
    const swept = await t.mutation(internal.runner.sweep, { now: Date.now() });
    expect(swept.swept).toBeGreaterThanOrEqual(1);
    const run = await asOwner.query(api.runs.get, { runId });
    expect(run).toMatchObject({
      status: "cleanup_pending",
      failedStage: "creating_sandbox",
      stale: false,
    });
    expect(run.diagnostics).toMatch(/lost lease/);

    const cleanupClaim = await t.mutation(internal.runner.claimNext, {
      workerId: "worker-b",
      claimMs: 30_000,
    });
    expect(cleanupClaim).toMatchObject({ runId, status: "cleaning" });
    expect(cleanupClaim!.claimId).not.toBe(claim!.claimId);
  });

  it("sweeps ready runs past readyUntil as expired", async () => {
    const { t, asOwner } = await ownerFixture();
    await seedFixtureProfile(t);
    const { runId } = await asOwner.mutation(api.runs.enqueue, { kind: "environment_test" });
    const claim = await t.mutation(internal.runner.claimNext, {
      workerId: "worker-a",
      claimMs: 30_000,
    });
    for (const stage of ["cloning", "installing", "starting", "checking_readiness"] as const) {
      await t.mutation(internal.runner.recordStage, {
        runId,
        claimId: claim!.claimId,
        stage,
      });
    }
    await t.mutation(internal.runner.markReady, {
      runId,
      claimId: claim!.claimId,
      previewUrl: "https://example.vercel.run",
      readyUntil: Date.now() - 1,
    });
    await t.mutation(internal.runner.sweep, { now: Date.now() });
    const run = await asOwner.query(api.runs.get, { runId });
    expect(run).toMatchObject({
      status: "cleanup_pending",
      terminalOutcome: "expired",
    });
  });

  it("rejects unauthenticated runner HTTP routes", async () => {
    const { t } = createTestConvex();
    const response = await t.fetch("/runner/claimNext", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workerId: "w", claimMs: 30_000 }),
    });
    expect(response.status).toBe(401);
  });

  it("allows a bearer-authenticated runner to claim through HTTP", async () => {
    const { t, asOwner } = await ownerFixture();
    await seedFixtureProfile(t);
    const { runId } = await asOwner.mutation(api.runs.enqueue, { kind: "environment_test" });
    const response = await t.fetch("/runner/claimNext", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RUNNER_SECRET}`,
      },
      body: JSON.stringify({ workerId: "http-worker", claimMs: 30_000 }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ runId, status: "provisioning" });
    expect(typeof body.claimId).toBe("string");
  });
});
