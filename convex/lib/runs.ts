import { v } from "convex/values";

export const runKind = v.literal("environment_test");

export const runStatus = v.union(
  v.literal("queued"),
  v.literal("provisioning"),
  v.literal("ready"),
  v.literal("cleanup_pending"),
  v.literal("cleaning"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("expired"),
);

export const runStage = v.union(
  v.literal("creating_sandbox"),
  v.literal("cloning"),
  v.literal("installing"),
  v.literal("starting"),
  v.literal("checking_readiness"),
);

export const runOutcome = v.union(
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("expired"),
);

export const STAGE_ORDER = [
  "creating_sandbox",
  "cloning",
  "installing",
  "starting",
  "checking_readiness",
] as const;

export type RunStage = (typeof STAGE_ORDER)[number];

export function isNextStage(current: RunStage | undefined, next: RunStage) {
  if (!current) return next === "creating_sandbox";
  const currentIndex = STAGE_ORDER.indexOf(current);
  const nextIndex = STAGE_ORDER.indexOf(next);
  return currentIndex >= 0 && nextIndex === currentIndex + 1;
}

export const SETUP_BUDGET_MS = 7 * 60_000;
export const CREATE_TIMEOUT_MS = 60_000;
export const DEFAULT_PREVIEW_TTL_MS = 10 * 60_000;

export function publicRunFields(run: {
  _id: string;
  kind: "environment_test";
  ownerUserId: string;
  active: boolean;
  status:
    | "queued"
    | "provisioning"
    | "ready"
    | "cleanup_pending"
    | "cleaning"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "expired";
  stage?: RunStage;
  failedStage?: RunStage;
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
  claimExpiresAt?: number;
  cancelRequested: boolean;
  diagnostics?: string;
  cleanupAttempts?: number;
  terminalOutcome?: "succeeded" | "failed" | "cancelled" | "expired";
  createdAt: number;
  updatedAt: number;
  finishedAt?: number;
}) {
  const now = Date.now();
  const stale =
    (run.status === "provisioning" || run.status === "cleaning") &&
    Boolean(run.claimExpiresAt && run.claimExpiresAt < now);
  return {
    id: run._id,
    kind: run.kind,
    active: run.active,
    status: run.status,
    stage: run.stage,
    failedStage: run.failedStage,
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
    cancelRequested: run.cancelRequested,
    diagnostics: run.diagnostics,
    cleanupAttempts: run.cleanupAttempts,
    terminalOutcome: run.terminalOutcome,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    stale,
  };
}
