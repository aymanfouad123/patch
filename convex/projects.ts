import { v } from "convex/values";

import { mutation, query } from "./_generated/server";
import { requireOwnerIdentity } from "./lib/requireOwner";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireOwnerIdentity(ctx);

    return await ctx.db
      .query("projects")
      .withIndex("by_owner", (q) => q.eq("ownerUserId", owner.userId))
      .collect();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    repoUrl: v.string(),
    baseBranch: v.string(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwnerIdentity(ctx);
    const now = Date.now();

    return await ctx.db.insert("projects", {
      ownerUserId: owner.userId,
      name: args.name.trim(),
      repoUrl: args.repoUrl.trim(),
      baseBranch: args.baseBranch.trim(),
      createdAt: now,
      updatedAt: now,
    });
  },
});
