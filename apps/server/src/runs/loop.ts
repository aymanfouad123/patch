import type { RunnerClient } from "../convex";
import type { ServerEnv } from "../env";
import type { SandboxCredentials } from "../sandbox/credentials";
import type { SandboxFactory } from "../sandbox/types";
import { cleanupRun } from "./cleanup";
import { provisionRun } from "./provision";

const TICK_MS = 2_000;
const CLAIM_MS = 30_000;
const SETUP_BUDGET_MS = 7 * 60_000;
const PROVIDER_MARGIN_MS = 2 * 60_000;

export type LoopHandle = {
  stop: () => Promise<void>;
};

export function startRunLoop(params: {
  env: ServerEnv;
  runner: RunnerClient;
  factory: SandboxFactory;
  credentials: SandboxCredentials;
  hostEnv?: NodeJS.ProcessEnv;
  log?: (message: string) => void;
}): LoopHandle {
  const {
    env,
    runner,
    factory,
    credentials,
    hostEnv = process.env,
    log = console.log,
  } = params;

  let stopping = false;
  let busy = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;

  const providerTimeoutMs = SETUP_BUDGET_MS + env.PREVIEW_TTL_MS + PROVIDER_MARGIN_MS;

  async function tick() {
    if (stopping || busy) return;
    busy = true;
    try {
      await runner.sweep({ now: Date.now() });
      if (stopping) return;
      const claim = await runner.claimNext({
        workerId: env.WORKER_ID,
        claimMs: CLAIM_MS,
      });
      if (!claim || stopping) return;

      inFlight = (async () => {
        if (claim.status === "cleaning") {
          await cleanupRun({ claim, runner, factory, credentials, log });
          return;
        }

        const result = await provisionRun({
          claim,
          runner,
          factory,
          credentials,
          hostEnv,
          previewTtlMs: env.PREVIEW_TTL_MS,
          claimMs: CLAIM_MS,
          providerTimeoutMs,
          log,
        });

        if (result.ok) return;

        if (!claim.claimId) {
          log(`[${claim.runId}] missing claim id after failure; leaving for sweep`);
          return;
        }
        const marked = await runner.markFailed({
          runId: claim.runId,
          claimId: claim.claimId,
          failedStage: result.failedStage,
          diagnostics: result.diagnostics,
          outcome: result.outcome,
        });
        if (!marked) {
          log(`[${claim.runId}] markFailed rejected; leaving for sweep`);
          return;
        }
        await cleanupRun({
          claim: { ...claim, status: "cleaning", terminalOutcome: result.outcome },
          runner,
          factory,
          credentials,
          log,
        });
      })();

      await inFlight;
    } catch (error) {
      log(`run loop error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      inFlight = undefined;
      busy = false;
    }
  }

  timer = setInterval(() => {
    void tick();
  }, TICK_MS);
  void tick();

  return {
    stop: async () => {
      stopping = true;
      if (timer) clearInterval(timer);
      const grace = new Promise<void>((resolve) => setTimeout(resolve, 20_000));
      await Promise.race([inFlight ?? Promise.resolve(), grace]);
    },
  };
}
