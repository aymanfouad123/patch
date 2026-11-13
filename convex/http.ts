import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { authorizeRunner } from "./lib/runnerAuth";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);

async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function runnerRoute(
  name: string,
  run: (ctx: { runMutation: (ref: any, args: any) => Promise<any> }, body: any) => Promise<Response>,
) {
  http.route({
    path: `/runner/${name}`,
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const auth = authorizeRunner(request);
      if (!auth.ok) return auth.response;
      const body = await readJson(request);
      if (body === null || typeof body !== "object") {
        return json({ error: "Invalid JSON body" }, 400);
      }
      try {
        return await run(ctx, body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return json({ error: message }, 400);
      }
    }),
  });
}

runnerRoute("claimNext", async (ctx, body) => {
  if (typeof body.workerId !== "string" || typeof body.claimMs !== "number") {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.claimNext, {
    workerId: body.workerId,
    claimMs: body.claimMs,
  });
  return json(result);
});

runnerRoute("renewClaim", async (ctx, body) => {
  if (
    typeof body.runId !== "string" ||
    typeof body.claimId !== "string" ||
    typeof body.claimMs !== "number"
  ) {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.renewClaim, {
    runId: body.runId,
    claimId: body.claimId,
    claimMs: body.claimMs,
  });
  return json(result);
});

runnerRoute("recordStage", async (ctx, body) => {
  if (
    typeof body.runId !== "string" ||
    typeof body.claimId !== "string" ||
    typeof body.stage !== "string"
  ) {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.recordStage, {
    runId: body.runId,
    claimId: body.claimId,
    stage: body.stage,
  });
  return json(result);
});

runnerRoute("recordSandbox", async (ctx, body) => {
  if (
    typeof body.runId !== "string" ||
    typeof body.claimId !== "string" ||
    typeof body.sandboxId !== "string" ||
    typeof body.providerTimeoutAt !== "number"
  ) {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.recordSandbox, {
    runId: body.runId,
    claimId: body.claimId,
    sandboxId: body.sandboxId,
    providerTimeoutAt: body.providerTimeoutAt,
  });
  return json(result);
});

runnerRoute("markReady", async (ctx, body) => {
  if (
    typeof body.runId !== "string" ||
    typeof body.claimId !== "string" ||
    typeof body.previewUrl !== "string" ||
    typeof body.readyUntil !== "number"
  ) {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.markReady, {
    runId: body.runId,
    claimId: body.claimId,
    previewUrl: body.previewUrl,
    readyUntil: body.readyUntil,
  });
  return json(result);
});

runnerRoute("markFailed", async (ctx, body) => {
  if (
    typeof body.runId !== "string" ||
    typeof body.claimId !== "string" ||
    typeof body.failedStage !== "string" ||
    typeof body.diagnostics !== "string"
  ) {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.markFailed, {
    runId: body.runId,
    claimId: body.claimId,
    failedStage: body.failedStage,
    diagnostics: body.diagnostics,
    outcome: body.outcome,
  });
  return json(result);
});

runnerRoute("markCleaned", async (ctx, body) => {
  if (
    typeof body.runId !== "string" ||
    typeof body.claimId !== "string" ||
    typeof body.outcome !== "string"
  ) {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.markCleaned, {
    runId: body.runId,
    claimId: body.claimId,
    outcome: body.outcome,
    cleanupError: body.cleanupError,
  });
  return json(result);
});

runnerRoute("sweep", async (ctx, body) => {
  if (typeof body.now !== "number") {
    return json({ error: "Invalid arguments" }, 400);
  }
  const result = await ctx.runMutation(internal.runner.sweep, { now: body.now });
  return json(result);
});

export default http;
