import type { RunnerClaim, RunnerClient } from "../convex";
import type { SandboxCredentials } from "../sandbox/credentials";
import type { SandboxFactory } from "../sandbox/types";

const CREATE_TIMEOUT_MS = 60_000;

export async function cleanupRun(params: {
  claim: RunnerClaim;
  runner: RunnerClient;
  factory: SandboxFactory;
  credentials: SandboxCredentials;
  log?: (message: string) => void;
}) {
  const { claim, runner, factory, credentials, log = console.log } = params;
  const createStartedAt = claim.createStartedAt ?? 0;
  const waitUntil = createStartedAt + CREATE_TIMEOUT_MS;
  const remaining = waitUntil - Date.now();
  if (remaining > 0) {
    log(`[${claim.runId}] waiting ${remaining}ms for in-flight create window`);
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }

  let cleanupError: string | undefined;
  try {
    const sandbox = await factory.get({
      name: claim.sandboxName,
      credentials,
      signal: AbortSignal.timeout(30_000),
    });
    if (sandbox) {
      await sandbox.stop({ signal: AbortSignal.timeout(30_000) });
      log(`[${claim.runId}] stopped sandbox ${claim.sandboxName}`);
    } else {
      log(`[${claim.runId}] sandbox ${claim.sandboxName} already gone`);
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error.message : String(error);
    log(`[${claim.runId}] cleanup error: ${cleanupError}`);
  }

  const outcome =
    claim.terminalOutcome === "succeeded" ||
    claim.terminalOutcome === "cancelled" ||
    claim.terminalOutcome === "expired" ||
    claim.terminalOutcome === "failed"
      ? claim.terminalOutcome
      : claim.cancelRequested
        ? "cancelled"
        : "failed";

  if (!claim.claimId) throw new Error("cleanup requires an active claim");
  const done = await runner.markCleaned({
    runId: claim.runId,
    claimId: claim.claimId,
    outcome,
    cleanupError,
  });
  return { done, outcome, cleanupError };
}
