import { ConvexError, v } from "convex/values";
import { mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnerIdentity } from "./lib/requireOwner";
import { resolveApprovedEnv } from "./lib/environment";
import type { MutationCtx } from "./_generated/server";

export async function createWorkspace(
  ctx: MutationCtx,
  userId: string,
  options: {
    repoUrl: string;
    purpose?: "prepare";
    profileVersion?: number;
    rejectActive?: boolean;
  },
) {
  const active = await ctx.db
    .query("workspaces")
    .withIndex("by_owner_and_active", (q) => q.eq("ownerUserId", userId).eq("active", true))
    .first();
  if (active) {
    if (options.rejectActive) throw new ConvexError({ code: "WORKSPACE_ACTIVE" });
    return active._id;
  }
  const now = Date.now();
  const id = await ctx.db.insert("workspaces", {
    ownerUserId: userId,
    repoUrl: options.repoUrl,
    status: "queued",
    active: true,
    expiresAt: now + 16 * 60_000,
    sandboxName: `patch-workspace-${now}-${userId.replace(/[^a-zA-Z0-9]/g, "").slice(-16)}`,
    createdAt: now,
    updatedAt: now,
    purpose: options.purpose,
    profileVersion: options.profileVersion,
  });
  await ctx.scheduler.runAt(now + 16 * 60_000, internal.workspaces.expire, { id });
  await ctx.scheduler.runAfter(0, internal.workspaceActions.provision, { id });
  await ctx.scheduler.runAfter(8 * 60_000, internal.workspaces.watchdog, { id });
  return id;
}

export const startWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const profile = await ctx.db
      .query("environmentProfiles")
      .withIndex("by_singleton", (q) => q.eq("singleton", "project"))
      .unique();
    const raw = profile?.repoUrl ?? process.env.PATCH_REPO_URL?.trim();
    if (!raw || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(raw))
      throw new ConvexError("Set PATCH_REPO_URL to a public HTTPS GitHub repository URL");
    if (profile) {
      const selected = profile.verified?.config ?? profile;
      const resolved = resolveApprovedEnv(selected, process.env);
      if (resolved.rejected.length)
        throw new ConvexError({ code: "REJECTED_VARIABLES", names: resolved.rejected });
      if (resolved.missing.length)
        throw new ConvexError({ code: "MISSING_VARIABLES", names: resolved.missing });
    }
    return createWorkspace(ctx, userId, { repoUrl: raw });
  },
});
export const latestWorkspace = query({
  args: {},
  handler: async (ctx) => {
    const { userId } = await requireOwnerIdentity(ctx);
    return ctx.db
      .query("workspaces")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", userId))
      .order("desc")
      .first();
  },
});
export const stopWorkspace = mutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, { id }) => {
    const { userId } = await requireOwnerIdentity(ctx);
    const row = await ctx.db.get(id);
    if (!row || row.ownerUserId !== userId) throw new ConvexError("NOT_FOUND");
    if (!row.active) return;
    await ctx.db.patch(id, {
      status: "stopping",
      terminalStatus: "stopped",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.workspaceActions.cleanup, { id });
  },
});
export const get = internalQuery({
  args: { id: v.id("workspaces") },
  handler: (ctx, { id }) => ctx.db.get(id),
});
export const advance = internalMutation({
  args: {
    id: v.id("workspaces"),
    expected: v.string(),
    status: v.string(),
    sandboxId: v.optional(v.string()),
    commitSha: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { id, expected, ...fields }) => {
    const row = await ctx.db.get(id);
    if (
      !row ||
      !row.active ||
      row.status !== expected ||
      (row.expiresAt && row.expiresAt <= Date.now())
    )
      return false;
    const defined = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
    await ctx.db.patch(id, { ...defined, updatedAt: Date.now() });
    if (fields.expiresAt)
      await ctx.scheduler.runAt(fields.expiresAt, internal.workspaces.expire, { id });
    return true;
  },
});
export const terminate = internalMutation({
  args: { id: v.id("workspaces"), reason: v.string(), error: v.optional(v.string()) },
  handler: async (ctx, { id, reason, error }) => {
    const row = await ctx.db.get(id);
    if (!row || !row.active) return;
    await ctx.db.patch(id, {
      status: "stopping",
      terminalStatus: row.terminalStatus ?? reason,
      error: error?.slice(-4000) ?? row.error,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.workspaceActions.cleanup, { id });
  },
});
export const cleaned = internalMutation({
  args: { id: v.id("workspaces"), error: v.optional(v.string()) },
  handler: async (ctx, { id, error }) => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== "stopping") return;
    const attempts = (row.cleanupAttempts ?? 0) + 1;
    if (error && (!row.expiresAt || Date.now() < row.expiresAt)) {
      await ctx.db.patch(id, {
        cleanupAttempts: attempts,
        error: `${row.error ?? ""}\nCleanup: ${error}`.slice(-4000),
        updatedAt: Date.now(),
      });
      if (attempts < 4)
        await ctx.scheduler.runAfter(15_000 * attempts, internal.workspaceActions.cleanup, { id });
      return;
    }
    await ctx.db.patch(id, {
      active: false,
      status: row.terminalStatus ?? "stopped",
      previewUrl: undefined,
      updatedAt: Date.now(),
    });
  },
});
export const watchdog = internalMutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (
      row?.active &&
      ["queued", "creating", "cloning", "installing", "starting"].includes(row.status)
    )
      await ctx.scheduler.runAfter(0, internal.workspaceActions.failSetup, { id });
  },
});
export const expire = internalMutation({
  args: { id: v.id("workspaces") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row?.active) return;
    await ctx.db.patch(id, {
      status: "stopping",
      terminalStatus: row.terminalStatus ?? "expired",
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.workspaceActions.cleanup, { id });
  },
});
