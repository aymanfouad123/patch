"use node";
import { v } from "convex/values";
import { Sandbox } from "@vercel/sandbox";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { readSandboxCredentials } from "./lib/sandboxCredentials";
import {
  detectMissingVariables,
  redact,
  resolveApprovedEnv,
  type EnvironmentConfig,
} from "./lib/environment";

const args = { id: v.id("workspaces") };
export const provision = internalAction({
  args,
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.workspaces.get, { id });
    if (
      !row ||
      !(await ctx.runMutation(internal.workspaces.advance, {
        id,
        expected: "queued",
        status: "creating",
      }))
    )
      return;
    let sandbox: Sandbox | undefined;
    const startedAt = Date.now();
    const deadline = Date.now() + 7 * 60_000;
    const profile = await ctx.runQuery(internal.environment.getForProvision, {});
    const fallbackConfig: EnvironmentConfig = {
      repoUrl: row.repoUrl,
      installCommand: "pnpm install --frozen-lockfile",
      startCommand: "pnpm --filter @patch/web dev --hostname 0.0.0.0 --port 3000",
      port: 3000,
      healthPath: "/",
      previewMode: true,
      variables: [],
    };
    const config: EnvironmentConfig =
      row.purpose === "prepare"
        ? profile
          ? {
              repoUrl: profile.repoUrl,
              installCommand: profile.installCommand,
              startCommand: profile.startCommand,
              port: profile.port,
              healthPath: profile.healthPath,
              previewMode: profile.previewMode,
              variables: profile.variables,
            }
          : fallbackConfig
        : (profile?.verified?.config ??
          (profile
            ? {
                repoUrl: profile.repoUrl,
                installCommand: profile.installCommand,
                startCommand: profile.startCommand,
                port: profile.port,
                healthPath: profile.healthPath,
                previewMode: profile.previewMode,
                variables: profile.variables,
              }
            : fallbackConfig));
    if (row.purpose === "prepare" && (!profile || row.profileVersion !== profile.version)) {
      await ctx.runMutation(internal.workspaces.terminate, {
        id,
        reason: "failed",
        error: "Environment profile changed before preparation started",
      });
      return;
    }
    const approved = resolveApprovedEnv(config, process.env);
    if (approved.missing.length || approved.rejected.length) {
      const names = [...approved.missing, ...approved.rejected];
      const error = `Environment configuration is unavailable: ${names.join(", ")}`;
      if (row.purpose === "prepare" && row.profileVersion !== undefined)
        await ctx.runMutation(internal.environment.recordFailure, {
          profileVersion: row.profileVersion,
          error,
          missingVariables: approved.missing,
        });
      await ctx.runMutation(internal.workspaces.terminate, {
        id,
        reason: "failed",
        error,
      });
      return;
    }
    async function stage(expected: string, status: string, fields = {}) {
      if (
        !(await ctx.runMutation(internal.workspaces.advance, { id, expected, status, ...fields }))
      )
        throw new Error("Workspace cancelled or expired");
    }
    try {
      sandbox = await Sandbox.create({
        ...readSandboxCredentials(),
        name: row.sandboxName,
        image: "vercel/sandbox/node:24",
        persistent: false,
        timeout: 15 * 60_000,
        resources: { vcpus: 2 },
        ports: [config.port],
        networkPolicy: { allow: ["github.com", "*.githubusercontent.com"] },
        signal: AbortSignal.timeout(60_000),
        env: approved.creationEnv,
      });
      await stage("creating", "cloning", {
        sandboxId: sandbox.currentSession().sessionId,
        expiresAt: sandbox.expiresAt?.getTime() ?? Date.now() + 15 * 60_000,
      });
      const run = async (
        cmd: string,
        argv: string[],
        timeoutMs: number,
        cwd = sandbox!.cwd,
        env: Record<string, string> = {},
      ) => {
        const result = await sandbox!.runCommand({
          cmd,
          args: argv,
          cwd,
          timeoutMs: Math.max(1, Math.min(timeoutMs, deadline - Date.now())),
          env,
        });
        if (result.exitCode !== 0)
          throw new Error(`${cmd} failed: ${(await result.stderr()).slice(-3000)}`);
        return (await result.stdout()).trim();
      };
      await run(
        "git",
        ["-c", "credential.helper=", "clone", "--depth", "1", "--", row.repoUrl, "repo"],
        60_000,
        sandbox.cwd,
        { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" },
      );
      const cwd = `${sandbox.cwd}/repo`;
      const commitSha = await run("git", ["rev-parse", "HEAD"], 10_000, cwd);
      if (profile) await ctx.runMutation(internal.environment.recordClonedCommit, { commitSha });
      await stage("cloning", "installing", { commitSha });
      await sandbox.updateNetworkPolicy({ allow: ["registry.npmjs.org"] });
      const manager = await run(
        "node",
        ["-p", "require('./package.json').packageManager"],
        10_000,
        cwd,
      );
      if (!/^pnpm@\d+\.\d+\.\d+$/.test(manager))
        throw new Error("Repository must pin a pnpm version");
      await run(
        "npm",
        ["install", "--prefix", "/tmp/patch-tools", "--no-audit", "--no-fund", manager],
        30_000,
      );
      await run("sh", ["-c", config.installCommand], 240_000, cwd, {
        PATH: "/tmp/patch-tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
      });
      await stage("installing", "starting");
      await sandbox.updateNetworkPolicy(
        approved.allowHosts.length ? { allow: approved.allowHosts } : "deny-all",
      );
      await sandbox.runCommand({
        cmd: "sh",
        args: ["-c", `exec ${config.startCommand} > /tmp/patch-dev.log 2>&1`],
        cwd,
        detached: true,
        env: {
          PATH: "/tmp/patch-tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
          ...approved.commandEnv,
        },
      });
      await run(
        "node",
        [
          "-e",
          `(async()=>{const end=Date.now()+90000; while(Date.now()<end){try{const r=await fetch(${JSON.stringify(`http://127.0.0.1:${config.port}${config.healthPath}`)},{signal:AbortSignal.timeout(3000)});if(r.ok)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,1000))}console.error(require('fs').readFileSync('/tmp/patch-dev.log','utf8').slice(-3000));process.exit(1)})().catch(e=>{console.error(e);process.exit(1)})`,
        ],
        95_000,
        cwd,
      );
      await stage("starting", "ready", { previewUrl: sandbox.domain(config.port) });
      if (row.purpose === "prepare" && row.profileVersion !== undefined)
        await ctx.runMutation(internal.environment.recordVerified, {
          profileVersion: row.profileVersion,
          commitSha,
          durationMs: Date.now() - startedAt,
        });
    } catch (error) {
      if (sandbox) {
        try {
          await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
        } catch {}
      }
      const rawError = error instanceof Error ? error.message : String(error);
      const safeError = redact(rawError, Object.values(approved.commandEnv));
      const candidates = [
        ...(profile?.candidates?.map((candidate) => candidate.name) ?? []),
        ...config.variables.map((variable) => variable.name),
      ];
      const missingVariables = detectMissingVariables(safeError, candidates);
      if (row.purpose === "prepare" && row.profileVersion !== undefined)
        await ctx.runMutation(internal.environment.recordFailure, {
          profileVersion: row.profileVersion,
          error: safeError,
          missingVariables,
        });
      await ctx.runMutation(internal.workspaces.terminate, {
        id,
        reason: "failed",
        error: safeError,
      });
    }
  },
});
export const cleanup = internalAction({
  args,
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.workspaces.get, { id });
    if (!row || row.status !== "stopping") return;
    let error: string | undefined;
    try {
      const sandbox = await Sandbox.get({
        ...readSandboxCredentials(),
        name: row.sandboxName,
        resume: false,
        signal: AbortSignal.timeout(30_000),
      });
      if (!["stopped", "failed"].includes(sandbox.status))
        await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/not_found|not found|no active session/i.test(message)) error = message;
    }
    await ctx.runMutation(internal.workspaces.cleaned, { id, error });
  },
});
export const failSetup = internalAction({
  args,
  handler: async (ctx, { id }) => {
    const row = await ctx.runQuery(internal.workspaces.get, { id });
    if (row?.purpose === "prepare" && row.profileVersion !== undefined)
      await ctx.runMutation(internal.environment.recordFailure, {
        profileVersion: row.profileVersion,
        error: "Environment preparation timed out",
        missingVariables: [],
      });
    await ctx.runMutation(internal.workspaces.terminate, {
      id,
      reason: "failed",
      error: "Workspace setup timed out",
    });
  },
});
