import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireOwnerIdentity } from "./lib/requireOwner";

const ACTIVE_STATUSES = new Set(["queued", "starting", "running"]);

function jobPublicFields(job: {
  _id: Id<"sandboxJobs">;
  status: "queued" | "starting" | "running" | "completed" | "failed";
  active: boolean;
  sandboxName?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  startedAt?: number;
  finishedAt?: number;
}) {
  return {
    id: job._id,
    status: job.status,
    active: job.active,
    sandboxName: job.sandboxName,
    stdout: job.stdout,
    stderr: job.stderr,
    exitCode: job.exitCode,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
  };
}

export const createJob = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireOwnerIdentity(ctx);

    const active = await ctx.db
      .query("sandboxJobs")
      .withIndex("by_owner_and_active", (q) =>
        q.eq("ownerUserId", userId).eq("active", true),
      )
      .first();

    if (active) {
      throw new ConvexError({ code: "JOB_ACTIVE" });
    }

    const now = Date.now();
    const jobId = await ctx.db.insert("sandboxJobs", {
      ownerUserId: userId,
      status: "queued",
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.sandboxActions.runJob, { jobId });

    return { jobId };
  },
});

export const getJob = query({
  args: { jobId: v.id("sandboxJobs") },
  handler: async (ctx, args) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const job = await ctx.db.get(args.jobId);
    if (!job || job.ownerUserId !== userId) {
      throw new ConvexError({ code: "NOT_FOUND" });
    }
    return jobPublicFields(job);
  },
});

export const latestJob = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const job = await ctx.db
      .query("sandboxJobs")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .order("desc")
      .first();
    return job ? jobPublicFields(job) : null;
  },
});

export const getJobInternal = internalQuery({
  args: { jobId: v.id("sandboxJobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const markStarting = internalMutation({
  args: { jobId: v.id("sandboxJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "queued") {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "starting",
      startedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const markRunning = internalMutation({
  args: {
    jobId: v.id("sandboxJobs"),
    sandboxName: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || job.status !== "starting") {
      return false;
    }
    await ctx.db.patch(args.jobId, {
      status: "running",
      sandboxName: args.sandboxName,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const markCompleted = internalMutation({
  args: {
    jobId: v.id("sandboxJobs"),
    stdout: v.string(),
    stderr: v.optional(v.string()),
    exitCode: v.number(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !ACTIVE_STATUSES.has(job.status)) {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      active: false,
      stdout: args.stdout,
      stderr: args.stderr,
      exitCode: args.exitCode,
      finishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const markFailed = internalMutation({
  args: {
    jobId: v.id("sandboxJobs"),
    error: v.string(),
    stderr: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    sandboxName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job || !ACTIVE_STATUSES.has(job.status)) {
      return false;
    }
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      active: false,
      error: args.error,
      stderr: args.stderr,
      exitCode: args.exitCode,
      sandboxName: args.sandboxName ?? job.sandboxName,
      finishedAt: now,
      updatedAt: now,
    });
    return true;
  },
});

export const recordStopError = internalMutation({
  args: {
    jobId: v.id("sandboxJobs"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) {
      return false;
    }
    const suffix = `stop failed: ${args.error}`;
    await ctx.db.patch(args.jobId, {
      error: job.error ? `${job.error}; ${suffix}` : suffix,
      updatedAt: Date.now(),
    });
    return true;
  },
});
