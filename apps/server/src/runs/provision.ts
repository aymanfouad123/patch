import {
  detectMissingVariables,
  redact,
  resolveApprovedEnv,
} from "@patch/environment";
import type { RunnerClaim, RunnerClient } from "../convex";
import type { SandboxCredentials } from "../sandbox/credentials";
import type { SandboxFactory, SandboxHandle } from "../sandbox/types";

const STAGE_ORDER = [
  "creating_sandbox",
  "cloning",
  "installing",
  "starting",
  "checking_readiness",
] as const;

export type ProvisionStage = (typeof STAGE_ORDER)[number];

export class ClaimLostError extends Error {
  constructor(message = "claim lost or cancelled") {
    super(message);
    this.name = "ClaimLostError";
  }
}

export type ProvisionResult =
  | { ok: true; previewUrl: string }
  | {
      ok: false;
      failedStage: ProvisionStage;
      diagnostics: string;
      outcome: "failed" | "cancelled";
    };

function requireClaimId(claim: RunnerClaim) {
  if (!claim.claimId) throw new ClaimLostError("missing claim");
  return claim.claimId;
}

async function ensureClaim(
  runner: RunnerClient,
  claim: RunnerClaim,
  claimMs: number,
) {
  const renewed = await runner.renewClaim({
    runId: claim.runId,
    claimId: requireClaimId(claim),
    claimMs,
  });
  if (!renewed.ok) throw new ClaimLostError();
  if (renewed.cancelRequested) throw new ClaimLostError("cancel requested");
}

async function advance(
  runner: RunnerClient,
  claim: RunnerClaim,
  stage: ProvisionStage,
  claimMs: number,
) {
  await ensureClaim(runner, claim, claimMs);
  if (claim.deadlineAt && Date.now() > claim.deadlineAt) {
    throw new Error("Setup deadline exceeded");
  }
  if (stage !== "creating_sandbox") {
    const ok = await runner.recordStage({
      runId: claim.runId,
      claimId: requireClaimId(claim),
      stage,
    });
    if (!ok) throw new ClaimLostError("stage rejected");
  }
}

export async function provisionRun(params: {
  claim: RunnerClaim;
  runner: RunnerClient;
  factory: SandboxFactory;
  credentials: SandboxCredentials;
  hostEnv: NodeJS.ProcessEnv;
  previewTtlMs: number;
  claimMs?: number;
  providerTimeoutMs: number;
  log?: (message: string) => void;
}): Promise<ProvisionResult> {
  const {
    claim,
    runner,
    factory,
    credentials,
    hostEnv,
    previewTtlMs,
    claimMs = 30_000,
    providerTimeoutMs,
    log = console.log,
  } = params;

  const approved = resolveApprovedEnv(
    {
      previewMode: claim.previewMode,
      variables: claim.variableNames.map((name) => ({
        name,
        source: `PATCH_DEV_${name}`,
      })),
    },
    hostEnv,
  );
  if (approved.missing.length || approved.rejected.length) {
    return {
      ok: false,
      failedStage: "creating_sandbox",
      diagnostics: `Environment configuration is unavailable: ${[
        ...approved.missing,
        ...approved.rejected,
      ].join(", ")}`,
      outcome: "failed",
    };
  }

  let sandbox: SandboxHandle | undefined;
  let failedStage: ProvisionStage = "creating_sandbox";

  try {
    await ensureClaim(runner, claim, claimMs);

    const existing = await factory.get({
      name: claim.sandboxName,
      credentials,
      signal: AbortSignal.timeout(30_000),
    });
    if (existing) {
      try {
        await existing.stop({ signal: AbortSignal.timeout(30_000) });
      } catch {}
      return {
        ok: false,
        failedStage: "creating_sandbox",
        diagnostics: `Sandbox ${claim.sandboxName} already existed from an interrupted attempt`,
        outcome: "failed",
      };
    }

    failedStage = "creating_sandbox";
    log(`[${claim.runId}] creating sandbox ${claim.sandboxName}`);
    sandbox = await factory.create({
      name: claim.sandboxName,
      credentials,
      port: claim.port,
      timeoutMs: providerTimeoutMs,
      creationEnv: approved.creationEnv,
      signal: AbortSignal.timeout(60_000),
    });
    await ensureClaim(runner, claim, claimMs);
    const recorded = await runner.recordSandbox({
      runId: claim.runId,
      claimId: requireClaimId(claim),
      sandboxId: sandbox.sandboxId,
      providerTimeoutAt: sandbox.expiresAt?.getTime() ?? Date.now() + providerTimeoutMs,
    });
    if (!recorded) throw new ClaimLostError("recordSandbox rejected");

    failedStage = "cloning";
    await advance(runner, claim, "cloning", claimMs);
    const run = async (
      cmd: string,
      argv: string[],
      timeoutMs: number,
      cwd = sandbox!.cwd,
      env: Record<string, string> = {},
    ) => {
      await ensureClaim(runner, claim, claimMs);
      const result = await sandbox!.runCommand({
        cmd,
        args: argv,
        cwd,
        timeoutMs: Math.max(
          1,
          Math.min(timeoutMs, (claim.deadlineAt ?? Date.now() + timeoutMs) - Date.now()),
        ),
        env,
      });
      if (result.exitCode !== 0) {
        throw new Error(`${cmd} failed: ${(await result.stderr()).slice(-3000)}`);
      }
      return (await result.stdout()).trim();
    };

    await run(
      "git",
      ["-c", "credential.helper=", "clone", "--depth", "1", "--", claim.repoUrl, "repo"],
      60_000,
      sandbox.cwd,
      { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" },
    );
    const repoRoot = `${sandbox.cwd}/repo`;
    await run(
      "git",
      ["fetch", "--depth", "1", "origin", claim.commitSha],
      60_000,
      repoRoot,
      { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" },
    );
    await run("git", ["checkout", claim.commitSha], 30_000, repoRoot, {
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
    });
    const cwd =
      claim.workingDirectory && claim.workingDirectory !== "."
        ? `${repoRoot}/${claim.workingDirectory}`
        : repoRoot;

    failedStage = "installing";
    await advance(runner, claim, "installing", claimMs);
    await sandbox.updateNetworkPolicy({ allow: ["registry.npmjs.org"] });
    const manager = await run(
      "node",
      ["-p", "require('./package.json').packageManager"],
      10_000,
      cwd,
    );
    if (!/^pnpm@\d+\.\d+\.\d+$/.test(manager)) {
      throw new Error("Repository must pin a pnpm version");
    }
    await run(
      "npm",
      ["install", "--prefix", "/tmp/patch-tools", "--no-audit", "--no-fund", manager],
      30_000,
    );
    await run("sh", ["-c", claim.installCommand], 240_000, cwd, {
      PATH: "/tmp/patch-tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
    });

    failedStage = "starting";
    await advance(runner, claim, "starting", claimMs);
    await sandbox.updateNetworkPolicy(
      approved.allowHosts.length ? { allow: approved.allowHosts } : "deny-all",
    );
    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", `exec ${claim.startCommand} > /tmp/patch-dev.log 2>&1`],
      cwd,
      detached: true,
      env: {
        PATH: "/tmp/patch-tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
        ...approved.commandEnv,
      },
    });

    failedStage = "checking_readiness";
    await advance(runner, claim, "checking_readiness", claimMs);
    await run(
      "node",
      [
        "-e",
        `(async()=>{const end=Date.now()+90000; while(Date.now()<end){try{const r=await fetch(${JSON.stringify(`http://127.0.0.1:${claim.port}${claim.healthPath}`)},{signal:AbortSignal.timeout(3000)});if(r.ok)process.exit(0)}catch{}await new Promise(r=>setTimeout(r,1000))}console.error(require('fs').readFileSync('/tmp/patch-dev.log','utf8').slice(-3000));process.exit(1)})().catch(e=>{console.error(e);process.exit(1)})`,
      ],
      95_000,
      cwd,
    );

    const previewUrl = sandbox.domain(claim.port);
    const ready = await runner.markReady({
      runId: claim.runId,
      claimId: requireClaimId(claim),
      previewUrl,
      readyUntil: Date.now() + previewTtlMs,
    });
    if (!ready) throw new ClaimLostError("markReady rejected");
    log(`[${claim.runId}] ready at ${previewUrl}`);
    return { ok: true, previewUrl };
  } catch (error) {
    const cancelled = error instanceof ClaimLostError && /cancel/i.test(error.message);
    const rawError = error instanceof Error ? error.message : String(error);
    let logTail = "";
    if (sandbox) {
      try {
        const result = await sandbox.runCommand({
          cmd: "sh",
          args: ["-c", "tail -c 3000 /tmp/patch-dev.log 2>/dev/null || true"],
          timeoutMs: 10_000,
        });
        logTail = await result.stdout();
      } catch {}
    }
    const diagnostics = redact(
      [rawError, logTail].filter(Boolean).join("\n"),
      Object.values(approved.commandEnv),
    );
    detectMissingVariables(diagnostics, claim.variableNames);
    return {
      ok: false,
      failedStage,
      diagnostics,
      outcome: cancelled ? "cancelled" : "failed",
    };
  }
}
