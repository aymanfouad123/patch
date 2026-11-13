import { describe, expect, it } from "vitest";
import type { ServerEnv } from "../env";
import { createApp } from "./app";

const env: ServerEnv = {
  CONVEX_URL: "https://example.convex.cloud",
  CONVEX_SITE_URL: "https://example.convex.site",
  PATCH_RUNNER_SECRET: "secret",
  VERCEL_TOKEN: "t",
  VERCEL_TEAM_ID: "team",
  VERCEL_PROJECT_ID: "project",
  PORT: 8787,
  PATCH_WEB_ORIGIN: "http://localhost:3000",
  PREVIEW_TTL_MS: 60_000,
  WORKER_ID: "test-worker",
};

describe("run API", () => {
  it("requires a bearer token", async () => {
    const app = createApp({
      env,
      enqueue: async () => ({ runId: "runs_1" }),
      getRun: async () => ({ id: "runs_1" }),
      cancelRun: async () => ({ id: "runs_1", status: "cancelled" }),
    });
    const response = await app.request("http://localhost/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "environment_test" }),
    });
    expect(response.status).toBe(401);
  });

  it("enqueues an environment_test run", async () => {
    const app = createApp({
      env,
      enqueue: async (jwt, kind) => {
        expect(jwt).toBe("user-jwt");
        expect(kind).toBe("environment_test");
        return { runId: "runs_1" };
      },
      getRun: async () => ({ id: "runs_1", status: "queued" }),
      cancelRun: async () => ({ id: "runs_1", status: "cancelled" }),
    });
    const response = await app.request("http://localhost/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer user-jwt",
      },
      body: JSON.stringify({ kind: "environment_test" }),
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ runId: "runs_1" });
  });

  it("maps RUN_ACTIVE to 409", async () => {
    const app = createApp({
      env,
      enqueue: async () => {
        throw new Error("RUN_ACTIVE");
      },
      getRun: async () => ({ id: "runs_1" }),
      cancelRun: async () => ({ id: "runs_1" }),
    });
    const response = await app.request("http://localhost/runs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer user-jwt",
      },
      body: JSON.stringify({ kind: "environment_test" }),
    });
    expect(response.status).toBe(409);
  });
});
