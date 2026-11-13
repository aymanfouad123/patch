import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOwnerIdentity } from "./lib/requireOwner";
import { publicRunFields, runKind, SETUP_BUDGET_MS } from "./lib/runs";

const SINGLETON = "project";

function isCommitSha(value: string) {
  return /^[0-9a-f]{7,40}$/i.test(value);
}

export const enqueue = mutation({
  args: { kind: runKind },
  handler: async (ctx, { kind }) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const active = await ctx.db
      .query("runs")
      .withIndex("by_owner_and_active", (q) => q.eq("ownerUserId", userId).eq("active", true))
      .first();
    if (active) throw new ConvexError({ code: "RUN_ACTIVE", runId: active._id });

    const profile = await ctx.db
      .query("environmentProfiles")
      .withIndex("by_singleton", (q) => q.eq("singleton", SINGLETON))
      .unique();
    if (!profile) throw new ConvexError("Save an environment profile before enqueueing a run");
    if (!profile.commitSha || !isCommitSha(profile.commitSha))
      throw new ConvexError("Environment profile requires a pinned commitSha");
    if (profile.version < 1)
      throw new ConvexError("Environment profile must be saved before enqueueing a run");

    const workingDirectory = (profile.workingDirectory ?? ".").trim() || ".";
    if (workingDirectory.includes("\0") || workingDirectory.startsWith("/"))
      throw new ConvexError("workingDirectory must be a relative path");

    const now = Date.now();
    const runId = await ctx.db.insert("runs", {
      kind,
      ownerUserId: userId,
      active: true,
      status: "queued",
      repoUrl: profile.repoUrl,
      commitSha: profile.commitSha,
      workingDirectory,
      installCommand: profile.installCommand,
      startCommand: profile.startCommand,
      port: profile.port,
      healthPath: profile.healthPath,
      previewMode: profile.previewMode,
      variableNames: profile.variables.map((variable) => variable.name),
      profileVersion: profile.version,
      sandboxName: "pending",
      cancelRequested: false,
      deadlineAt: now + SETUP_BUDGET_MS,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(runId, {
      sandboxName: `patch-run-${runId}`,
      updatedAt: Date.now(),
    });
    return { runId };
  },
});

export const get = query({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const run = await ctx.db.get(runId);
    if (!run || run.ownerUserId !== userId) throw new ConvexError({ code: "NOT_FOUND" });
    return publicRunFields(run);
  },
});

export const latest = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const run = await ctx.db
      .query("runs")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .order("desc")
      .first();
    return run ? publicRunFields(run) : null;
  },
});

export const cancel = mutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const run = await ctx.db.get(runId);
    if (!run || run.ownerUserId !== userId) throw new ConvexError({ code: "NOT_FOUND" });
    if (!run.active) return publicRunFields(run);

    const now = Date.now();
    const hasLiveClaim = Boolean(
      run.claimId && run.claimExpiresAt && run.claimExpiresAt > now,
    );

    if (run.status === "queued") {
      await ctx.db.patch(runId, {
        status: "cancelled",
        active: false,
        terminalOutcome: "cancelled",
        finishedAt: now,
        updatedAt: now,
      });
    } else if (run.status === "ready" || !hasLiveClaim) {
      await ctx.db.patch(runId, {
        status: "cleanup_pending",
        terminalOutcome: run.status === "ready" ? "succeeded" : (run.terminalOutcome ?? "cancelled"),
        cancelRequested: true,
        claimId: undefined,
        claimedBy: undefined,
        claimExpiresAt: undefined,
        previewUrl: undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(runId, {
        cancelRequested: true,
        terminalOutcome: run.terminalOutcome ?? "cancelled",
        updatedAt: now,
      });
    }

    const updated = await ctx.db.get(runId);
    return publicRunFields(updated!);
  },
});
