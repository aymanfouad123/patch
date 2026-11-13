import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { runKind, runOutcome, runStage, runStatus } from "./lib/runs";

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
    commitSha: v.optional(v.string()),
    workingDirectory: v.optional(v.string()),
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
  runs: defineTable({
    kind: runKind,
    ownerUserId: v.string(),
    active: v.boolean(),
    status: runStatus,
    stage: v.optional(runStage),
    failedStage: v.optional(runStage),
    repoUrl: v.string(),
    commitSha: v.string(),
    workingDirectory: v.string(),
    installCommand: v.string(),
    startCommand: v.string(),
    port: v.number(),
    healthPath: v.string(),
    previewMode: v.boolean(),
    variableNames: v.array(v.string()),
    profileVersion: v.number(),
    sandboxName: v.string(),
    sandboxId: v.optional(v.string()),
    createStartedAt: v.optional(v.number()),
    providerTimeoutAt: v.optional(v.number()),
    previewUrl: v.optional(v.string()),
    deadlineAt: v.optional(v.number()),
    readyUntil: v.optional(v.number()),
    claimId: v.optional(v.string()),
    claimedBy: v.optional(v.string()),
    claimExpiresAt: v.optional(v.number()),
    cancelRequested: v.boolean(),
    diagnostics: v.optional(v.string()),
    cleanupAttempts: v.optional(v.number()),
    terminalOutcome: v.optional(runOutcome),
    createdAt: v.number(),
    updatedAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status_and_createdAt", ["status", "createdAt"])
    .index("by_status_and_claimExpiresAt", ["status", "claimExpiresAt"])
    .index("by_status_and_readyUntil", ["status", "readyUntil"])
    .index("by_owner", ["ownerUserId"])
    .index("by_owner_and_active", ["ownerUserId", "active"]),
});
