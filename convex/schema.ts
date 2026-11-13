import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const sandboxJobStatus = v.union(
  v.literal("queued"),
  v.literal("starting"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
);

const environmentVariable = v.object({
  name: v.string(),
  source: v.string(),
});

const environmentConfig = v.object({
  repoUrl: v.string(),
  installCommand: v.string(),
  startCommand: v.string(),
  port: v.number(),
  healthPath: v.string(),
  previewMode: v.boolean(),
  variables: v.array(environmentVariable),
});

export default defineSchema({
  environmentProfiles: defineTable({
    singleton: v.string(),
    repoUrl: v.string(),
    installCommand: v.string(),
    startCommand: v.string(),
    port: v.number(),
    healthPath: v.string(),
    previewMode: v.boolean(),
    variables: v.array(environmentVariable),
    version: v.number(),
    status: v.union(
      v.literal("unverified"),
      v.literal("preparing"),
      v.literal("ready"),
      v.literal("failed"),
    ),
    detected: v.optional(
      v.object({
        runtime: v.string(),
        packageManager: v.string(),
        installCommand: v.string(),
        startCommand: v.string(),
        port: v.number(),
        healthPath: v.string(),
      }),
    ),
    candidates: v.optional(
      v.array(
        v.object({
          name: v.string(),
          stages: v.array(v.union(v.literal("install"), v.literal("build"), v.literal("runtime"))),
          files: v.array(v.string()),
          blocked: v.boolean(),
        }),
      ),
    ),
    latestCommitSha: v.optional(v.string()),
    lastAttemptAt: v.optional(v.number()),
    lastVerifiedAt: v.optional(v.number()),
    lastError: v.optional(v.string()),
    lastMissingVariables: v.optional(v.array(v.string())),
    verified: v.optional(
      v.object({
        version: v.number(),
        commitSha: v.string(),
        config: environmentConfig,
        durationMs: v.number(),
        verifiedAt: v.number(),
      }),
    ),
    updatedAt: v.number(),
  }).index("by_singleton", ["singleton"]),
  workspaces: defineTable({
    ownerUserId: v.string(),
    repoUrl: v.string(),
    status: v.string(),
    active: v.boolean(),
    sandboxName: v.string(),
    sandboxId: v.optional(v.string()),
    commitSha: v.optional(v.string()),
    previewUrl: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
    error: v.optional(v.string()),
    terminalStatus: v.optional(v.string()),
    cleanupAttempts: v.optional(v.number()),
    purpose: v.optional(v.literal("prepare")),
    profileVersion: v.optional(v.number()),
  })
    .index("by_owner_and_active", ["ownerUserId", "active"])
    .index("by_owner", ["ownerUserId"]),
  sandboxJobs: defineTable({
    ownerUserId: v.string(),
    status: sandboxJobStatus,
    active: v.boolean(),
    sandboxName: v.optional(v.string()),
    stdout: v.optional(v.string()),
    stderr: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_owner_and_active", ["ownerUserId", "active"])
    .index("by_owner", ["ownerUserId"]),
});
