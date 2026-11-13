import { Hono } from "hono";
import { cors } from "hono/cors";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { ServerEnv } from "../env";

type RunEnqueueResult = { runId: string };
type RunView = Record<string, unknown>;

export function createApp(params: {
  env: ServerEnv;
  enqueue: (jwt: string, kind: string) => Promise<RunEnqueueResult>;
  getRun: (jwt: string, runId: string) => Promise<RunView>;
  cancelRun: (jwt: string, runId: string) => Promise<RunView>;
}) {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: params.env.PATCH_WEB_ORIGIN,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "OPTIONS"],
    }),
  );

  app.get("/healthz", (c) => c.json({ ok: true }));

  app.post("/runs", async (c) => {
    const jwt = bearer(c.req.header("authorization"));
    if (!jwt) return c.json({ error: "Unauthorized" }, 401);
    let body: { kind?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (body.kind !== "environment_test") {
      return c.json({ error: "Unsupported kind" }, 400);
    }
    try {
      const result = await params.enqueue(jwt, body.kind);
      return c.json(result, 202);
    } catch (error) {
      return mapConvexError(c, error);
    }
  });

  app.get("/runs/:id", async (c) => {
    const jwt = bearer(c.req.header("authorization"));
    if (!jwt) return c.json({ error: "Unauthorized" }, 401);
    try {
      const run = await params.getRun(jwt, c.req.param("id"));
      return c.json(run);
    } catch (error) {
      return mapConvexError(c, error);
    }
  });

  app.post("/runs/:id/cancel", async (c) => {
    const jwt = bearer(c.req.header("authorization"));
    if (!jwt) return c.json({ error: "Unauthorized" }, 401);
    try {
      const run = await params.cancelRun(jwt, c.req.param("id"));
      return c.json(run);
    } catch (error) {
      return mapConvexError(c, error);
    }
  });

  return app;
}

export function createConvexRunHandlers(convexUrl: string) {
  return {
    enqueue: async (jwt: string, kind: string) => {
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(jwt);
      return client.mutation(anyApi.runs.enqueue, { kind });
    },
    getRun: async (jwt: string, runId: string) => {
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(jwt);
      return client.query(anyApi.runs.get, { runId });
    },
    cancelRun: async (jwt: string, runId: string) => {
      const client = new ConvexHttpClient(convexUrl);
      client.setAuth(jwt);
      return client.mutation(anyApi.runs.cancel, { runId });
    },
  };
}

function bearer(header: string | undefined) {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function mapConvexError(c: any, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/UNAUTHENTICATED|Unauthorized/i.test(message)) return c.json({ error: message }, 401);
  if (/FORBIDDEN/i.test(message)) return c.json({ error: message }, 403);
  if (/NOT_FOUND/i.test(message)) return c.json({ error: message }, 404);
  if (/RUN_ACTIVE/i.test(message)) return c.json({ error: message, code: "RUN_ACTIVE" }, 409);
  return c.json({ error: message }, 400);
}
