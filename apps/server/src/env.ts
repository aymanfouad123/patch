export type ServerEnv = {
  CONVEX_URL: string;
  CONVEX_SITE_URL: string;
  PATCH_RUNNER_SECRET: string;
  VERCEL_TOKEN: string;
  VERCEL_TEAM_ID: string;
  VERCEL_PROJECT_ID: string;
  PORT: number;
  PATCH_WEB_ORIGIN: string;
  PREVIEW_TTL_MS: number;
  WORKER_ID: string;
};

function required(name: string, env: NodeJS.ProcessEnv) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    CONVEX_URL: required("CONVEX_URL", env),
    CONVEX_SITE_URL: required("CONVEX_SITE_URL", env).replace(/\/$/, ""),
    PATCH_RUNNER_SECRET: required("PATCH_RUNNER_SECRET", env),
    VERCEL_TOKEN: required("VERCEL_TOKEN", env),
    VERCEL_TEAM_ID: required("VERCEL_TEAM_ID", env),
    VERCEL_PROJECT_ID: required("VERCEL_PROJECT_ID", env),
    PORT: Number(env.PORT ?? "8787"),
    PATCH_WEB_ORIGIN: (env.PATCH_WEB_ORIGIN ?? "http://localhost:3000").replace(/\/$/, ""),
    PREVIEW_TTL_MS: Number(env.PREVIEW_TTL_MS ?? String(10 * 60_000)),
    WORKER_ID: env.PATCH_WORKER_ID?.trim() || `server-${process.pid}`,
  };
}
