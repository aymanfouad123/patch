import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { applyFailure, applyVerified } from "./environment";
import { isNextStage, runOutcome, runStage, SETUP_BUDGET_MS, type RunStage } from "./lib/runs";

function claimMatches(run: Doc<"runs">, claimId: string) {
  return Boolean(run.claimId && run.claimId === claimId && run.active);
}

function clearClaim() {
  return {
    claimId: undefined,
    claimedBy: undefined,
    claimExpiresAt: undefined,
  };
}

export const claimNext = internalMutation({
  args: {
    workerId: v.string(),
    claimMs: v.number(),
  },
  handler: async (ctx, { workerId, claimMs }) => {
    if (!workerId.trim() || claimMs < 5_000 || claimMs > 5 * 60_000) return null;

    const cleanup = await ctx.db
      .query("runs")
      .withIndex("by_status_and_createdAt", (q) => q.eq("status", "cleanup_pending"))
      .order("asc")
      .first();
    const queued =
      cleanup ??
      (await ctx.db
        .query("runs")
        .withIndex("by_status_and_createdAt", (q) => q.eq("status", "queued"))
        .order("asc")
        .first());
    if (!queued || !queued.active) return null;

    const now = Date.now();
    const claimId = crypto.randomUUID();
    const claimExpiresAt = now + claimMs;

    if (queued.status === "cleanup_pending") {
      await ctx.db.patch(queued._id, {
        status: "cleaning",
        claimId,
        claimedBy: workerId,
        claimExpiresAt,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(queued._id, {
        status: "provisioning",
        stage: "creating_sandbox",
        createStartedAt: now,
        deadlineAt: queued.deadlineAt ?? now + SETUP_BUDGET_MS,
        claimId,
        claimedBy: workerId,
        claimExpiresAt,
        updatedAt: now,
      });
    }

    const run = await ctx.db.get(queued._id);
    return run
      ? {
          runId: run._id,
          claimId,
          status: run.status,
          stage: run.stage,
          cancelRequested: run.cancelRequested,
          repoUrl: run.repoUrl,
          commitSha: run.commitSha,
          workingDirectory: run.workingDirectory,
          installCommand: run.installCommand,
          startCommand: run.startCommand,
          port: run.port,
          healthPath: run.healthPath,
          previewMode: run.previewMode,
          variableNames: run.variableNames,
          profileVersion: run.profileVersion,
          sandboxName: run.sandboxName,
          sandboxId: run.sandboxId,
          createStartedAt: run.createStartedAt,
          providerTimeoutAt: run.providerTimeoutAt,
          previewUrl: run.previewUrl,
          deadlineAt: run.deadlineAt,
          readyUntil: run.readyUntil,
          terminalOutcome: run.terminalOutcome,
          failedStage: run.failedStage,
          diagnostics: run.diagnostics,
          cleanupAttempts: run.cleanupAttempts ?? 0,
        }
      : null;
  },
});

export const renewClaim = internalMutation({
  args: {
    runId: v.id("runs"),
    claimId: v.string(),
    claimMs: v.number(),
  },
  handler: async (ctx, { runId, claimId, claimMs }) => {
    const run = await ctx.db.get(runId);
    if (!run || !claimMatches(run, claimId)) return { ok: false as const, cancelRequested: true };
    await ctx.db.patch(runId, {
      claimExpiresAt: Date.now() + claimMs,
      updatedAt: Date.now(),
    });
    return { ok: true as const, cancelRequested: run.cancelRequested };
  },
});

export const recordStage = internalMutation({
  args: {
    runId: v.id("runs"),
    claimId: v.string(),
    stage: runStage,
  },
  handler: async (ctx, { runId, claimId, stage }) => {
    const run = await ctx.db.get(runId);
    if (!run || !claimMatches(run, claimId) || run.status !== "provisioning") return false;
    if (!isNextStage(run.stage, stage)) return false;
    await ctx.db.patch(runId, { stage, updatedAt: Date.now() });
    return true;
  },
});

export const recordSandbox = internalMutation({
  args: {
    runId: v.id("runs"),
    claimId: v.string(),
    sandboxId: v.string(),
    providerTimeoutAt: v.number(),
  },
  handler: async (ctx, { runId, claimId, sandboxId, providerTimeoutAt }) => {
    const run = await ctx.db.get(runId);
    if (!run || !claimMatches(run, claimId) || run.status !== "provisioning") return false;
    await ctx.db.patch(runId, {
      sandboxId,
      providerTimeoutAt,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const markReady = internalMutation({
  args: {
    runId: v.id("runs"),
    claimId: v.string(),
    previewUrl: v.string(),
    readyUntil: v.number(),
  },
  handler: async (ctx, { runId, claimId, previewUrl, readyUntil }) => {
    const run = await ctx.db.get(runId);
    if (!run || !claimMatches(run, claimId) || run.status !== "provisioning") return false;
    if (run.cancelRequested) return false;
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "ready",
      stage: "checking_readiness",
      previewUrl,
      readyUntil,
      terminalOutcome: "succeeded",
      ...clearClaim(),
      updatedAt: now,
    });
    await applyVerified(ctx, {
      profileVersion: run.profileVersion,
      commitSha: run.commitSha,
      durationMs: Math.max(0, now - run.createdAt),
    });
    return true;
  },
});

export const markFailed = internalMutation({
  args: {
    runId: v.id("runs"),
    claimId: v.string(),
    failedStage: runStage,
    diagnostics: v.string(),
    outcome: v.optional(runOutcome),
  },
  handler: async (ctx, { runId, claimId, failedStage, diagnostics, outcome }) => {
    const run = await ctx.db.get(runId);
    if (!run || !claimMatches(run, claimId)) return false;
    if (run.status !== "provisioning" && run.status !== "cleaning") return false;
    const now = Date.now();
    await ctx.db.patch(runId, {
      status: "cleaning",
      failedStage,
      diagnostics: diagnostics.slice(-4000),
      terminalOutcome: outcome ?? run.terminalOutcome ?? "failed",
      previewUrl: undefined,
      updatedAt: now,
    });
    if (run.kind === "environment_test") {
      await applyFailure(ctx, {
        profileVersion: run.profileVersion,
        error: diagnostics.slice(-4000),
        missingVariables: [],
      });
    }
    return true;
  },
});

export const markCleaned = internalMutation({
  args: {
    runId: v.id("runs"),
    claimId: v.string(),
    outcome: runOutcome,
    cleanupError: v.optional(v.string()),
  },
  handler: async (ctx, { runId, claimId, outcome, cleanupError }) => {
    const run = await ctx.db.get(runId);
    if (!run || !claimMatches(run, claimId)) return false;
    if (run.status !== "cleaning" && run.status !== "cleanup_pending") return false;
    const now = Date.now();
    const attempts = (run.cleanupAttempts ?? 0) + 1;
    if (cleanupError) {
      await ctx.db.patch(runId, {
        cleanupAttempts: attempts,
        diagnostics: `${run.diagnostics ?? ""}\nCleanup: ${cleanupError}`.slice(-4000),
        updatedAt: now,
      });
      if (attempts < 4 && (!run.providerTimeoutAt || now < run.providerTimeoutAt)) {
        await ctx.db.patch(runId, {
          status: "cleanup_pending",
          ...clearClaim(),
          updatedAt: now,
        });
        return false;
      }
    }
    await ctx.db.patch(runId, {
      status: outcome,
      active: false,
      terminalOutcome: outcome,
      previewUrl: undefined,
      finishedAt: now,
      cleanupAttempts: attempts,
      ...clearClaim(),
      updatedAt: now,
    });
    return true;
  },
});

export const sweep = internalMutation({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    let swept = 0;

    const provisioning = await ctx.db
      .query("runs")
      .withIndex("by_status_and_claimExpiresAt", (q) => q.eq("status", "provisioning"))
      .collect();
    const cleaning = await ctx.db
      .query("runs")
      .withIndex("by_status_and_claimExpiresAt", (q) => q.eq("status", "cleaning"))
      .collect();

    for (const run of [...provisioning, ...cleaning]) {
      if (!run.active || !run.claimExpiresAt || run.claimExpiresAt >= now) continue;
      const failedStage = (run.stage ?? "creating_sandbox") as RunStage;
      await ctx.db.patch(run._id, {
        status: "cleanup_pending",
        failedStage: run.status === "provisioning" ? failedStage : run.failedStage,
        diagnostics:
          run.status === "provisioning"
            ? `runner lost lease during ${failedStage}`
            : (run.diagnostics ?? "runner lost lease during cleanup"),
        terminalOutcome: run.terminalOutcome ?? (run.cancelRequested ? "cancelled" : "failed"),
        ...clearClaim(),
        updatedAt: now,
      });
      swept += 1;
    }

    const ready = await ctx.db
      .query("runs")
      .withIndex("by_status_and_readyUntil", (q) => q.eq("status", "ready"))
      .collect();
    for (const run of ready) {
      if (!run.active || !run.readyUntil || run.readyUntil >= now) continue;
      await ctx.db.patch(run._id, {
        status: "cleanup_pending",
        terminalOutcome: "expired",
        previewUrl: undefined,
        ...clearClaim(),
        updatedAt: now,
      });
      swept += 1;
    }

    return { swept };
  },
});

/** Test-only helper: force a claim to expire immediately. */
export const forceExpireClaim = internalMutation({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (!run?.claimId) return false;
    await ctx.db.patch(runId, {
      claimExpiresAt: Date.now() - 1,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export type RunnerClaim = {
  runId: Id<"runs">;
  claimId: string;
  status: Doc<"runs">["status"];
  stage?: RunStage;
  cancelRequested: boolean;
  repoUrl: string;
  commitSha: string;
  workingDirectory: string;
  installCommand: string;
  startCommand: string;
  port: number;
  healthPath: string;
  previewMode: boolean;
  variableNames: string[];
  profileVersion: number;
  sandboxName: string;
  sandboxId?: string;
  createStartedAt?: number;
  providerTimeoutAt?: number;
  previewUrl?: string;
  deadlineAt?: number;
  readyUntil?: number;
  terminalOutcome?: Doc<"runs">["terminalOutcome"];
  failedStage?: RunStage;
  diagnostics?: string;
  cleanupAttempts: number;
};
