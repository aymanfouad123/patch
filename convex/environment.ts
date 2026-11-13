import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOwnerIdentity } from "./lib/requireOwner";
import {
  discoverEnvironment as inspectEnvironment,
  isBlockedVariableName,
  isValidVariableName,
  redact,
  sourceForVariable,
  type EnvironmentConfig,
} from "@patch/environment";
const SINGLETON = "project";
const DEFAULT_INSTALL = "pnpm install --frozen-lockfile";
const DEFAULT_START = "pnpm dev --hostname 0.0.0.0 --port 3000";

function readRepoUrl() {
  const raw = process.env.PATCH_REPO_URL?.trim();
  if (!raw || !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(raw))
    throw new ConvexError("Set PATCH_REPO_URL to a public HTTPS GitHub repository URL");
  return raw;
}

function configOf(profile: {
  repoUrl: string;
  installCommand: string;
  startCommand: string;
  port: number;
  healthPath: string;
  previewMode: boolean;
  variables: { name: string; source: string }[];
}): EnvironmentConfig {
  return {
    repoUrl: profile.repoUrl,
    installCommand: profile.installCommand,
    startCommand: profile.startCommand,
    port: profile.port,
    healthPath: profile.healthPath,
    previewMode: profile.previewMode,
    variables: profile.variables,
  };
}

function validateCommand(value: string, label: string) {
  const command = value.trim();
  if (!command || command.length > 500 || /[\r\n\0]/.test(command))
    throw new ConvexError(`Invalid ${label}`);
  return command;
}

async function getProfile(ctx: Pick<QueryCtx | MutationCtx, "db">) {
  return ctx.db
    .query("environmentProfiles")
    .withIndex("by_singleton", (q) => q.eq("singleton", SINGLETON))
    .unique();
}

function verificationOf(profile: NonNullable<Awaited<ReturnType<typeof getProfile>>>) {
  if (profile.status === "preparing") return "preparing";
  if (profile.status === "failed") return "failed";
  if (!profile.verified) return "unverified";
  if (profile.verified.version !== profile.version) return "stale_config";
  if (profile.latestCommitSha && profile.verified.commitSha !== profile.latestCommitSha)
    return "stale_commit";
  return "verified";
}

export const getEnvironment = query({
  args: {},
  handler: async (ctx) => {
    await requireOwnerIdentity(ctx);
    const profile = await getProfile(ctx);
    if (!profile) {
      return {
        repoUrl: readRepoUrl(),
        installCommand: DEFAULT_INSTALL,
        startCommand: DEFAULT_START,
        port: 3000,
        healthPath: "/",
        previewMode: true,
        variables: [],
        version: 0,
        status: "unverified" as const,
        verification: "unverified" as const,
      };
    }
    return {
      ...profile,
      verification: verificationOf(profile),
      variables: profile.variables.map(({ name, source }) => ({
        name,
        configured: Boolean(process.env[source]?.trim()),
      })),
    };
  },
});

export const saveEnvironmentProfile = mutation({
  args: {
    installCommand: v.string(),
    startCommand: v.string(),
    port: v.number(),
    healthPath: v.string(),
    previewMode: v.boolean(),
    variables: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwnerIdentity(ctx);
    if (!Number.isInteger(args.port) || args.port < 1 || args.port > 65535)
      throw new ConvexError("Invalid port");
    if (
      !args.healthPath.startsWith("/") ||
      args.healthPath.length > 200 ||
      /[\r\n]/.test(args.healthPath)
    )
      throw new ConvexError("Invalid health path");
    const names = [...new Set(args.variables)];
    for (const name of names) {
      if (!isValidVariableName(name) || isBlockedVariableName(name))
        throw new ConvexError(`Variable ${name} is not allowed`);
    }
    const existing = await getProfile(ctx);
    const now = Date.now();
    const fields = {
      repoUrl: existing?.repoUrl ?? readRepoUrl(),
      installCommand: validateCommand(args.installCommand, "install command"),
      startCommand: validateCommand(args.startCommand, "start command"),
      port: args.port,
      healthPath: args.healthPath,
      previewMode: args.previewMode,
      variables: names.map((name) => ({ name, source: sourceForVariable(name) })),
      version: (existing?.version ?? 0) + 1,
      status: "unverified" as const,
      lastError: undefined,
      lastMissingVariables: undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("environmentProfiles", {
      singleton: SINGLETON,
      ...fields,
    });
  },
});

const candidateValidator = v.object({
  name: v.string(),
  stages: v.array(v.union(v.literal("install"), v.literal("build"), v.literal("runtime"))),
  files: v.array(v.string()),
  blocked: v.boolean(),
});

export const recordDiscovery = internalMutation({
  args: {
    repoUrl: v.string(),
    latestCommitSha: v.string(),
    detected: v.object({
      runtime: v.string(),
      packageManager: v.string(),
      installCommand: v.string(),
      startCommand: v.string(),
      port: v.number(),
      healthPath: v.string(),
    }),
    candidates: v.array(candidateValidator),
  },
  handler: async (ctx, args) => {
    const existing = await getProfile(ctx);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        detected: args.detected,
        candidates: args.candidates,
        latestCommitSha: args.latestCommitSha,
        updatedAt: now,
      });
      return existing._id;
    }
    return ctx.db.insert("environmentProfiles", {
      singleton: SINGLETON,
      repoUrl: args.repoUrl,
      installCommand: args.detected.installCommand,
      startCommand: args.detected.startCommand,
      port: args.detected.port,
      healthPath: args.detected.healthPath,
      previewMode: true,
      variables: [],
      version: 0,
      status: "unverified",
      detected: args.detected,
      candidates: args.candidates,
      latestCommitSha: args.latestCommitSha,
      updatedAt: now,
    });
  },
});

function githubRepo(repoUrl: string) {
  const match = repoUrl.match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (!match) throw new ConvexError("Repository must be a public GitHub HTTPS URL");
  return { owner: match[1], repo: match[2] };
}

function shouldFetch(path: string) {
  if (path.includes("node_modules/") || path.includes("/_generated/") || path.startsWith("convex/"))
    return false;
  const base = path.split("/").pop() ?? "";
  if (/^\.env\.(?:example|sample|template)$/.test(base)) return true;
  if (base.startsWith(".env")) return false;
  if (base === "package.json" || /^(?:next|vite|nuxt|astro)\.config\.[cm]?[jt]s$/.test(base))
    return true;
  return /\.(?:[cm]?[jt]sx?)$/.test(path);
}

async function githubJson(url: string) {
  // OAuth app authentication grants access to public data, with the app's own
  // rate limit. Never use a user's OAuth access token or pass this to Sandbox.
  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const authorization =
    clientId && clientSecret ? `Basic ${btoa(`${clientId}:${clientSecret}`)}` : undefined;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "patch-environment-v1",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(authorization ? { Authorization: authorization } : {}),
      },
      redirect: "error",
    });
  } catch {
    throw new ConvexError("Discovery could not reach GitHub. Try again shortly.");
  }
  if (!response.ok) {
    const body = redact(await response.text(), [
      clientId ?? "",
      clientSecret ?? "",
      authorization ?? "",
    ]);
    const rateLimit = Object.fromEntries(
      [
        "x-ratelimit-limit",
        "x-ratelimit-remaining",
        "x-ratelimit-used",
        "x-ratelimit-reset",
        "x-ratelimit-resource",
        "retry-after",
        "x-github-request-id",
      ].map((name) => [name, response.headers.get(name)]),
    );
    let detail = body;
    try {
      detail = JSON.parse(body).message ?? body;
    } catch {}
    const limited =
      response.status === 429 ||
      (response.status === 403 &&
        (rateLimit["x-ratelimit-remaining"] === "0" || /rate limit/i.test(detail)));
    const reset = Number(rateLimit["x-ratelimit-reset"]);
    const retry = rateLimit["retry-after"]
      ? ` Retry after ${rateLimit["retry-after"]} seconds.`
      : reset > 0
        ? ` Retry after ${new Date(reset * 1000).toISOString()}.`
        : "";
    const message = limited
      ? `GitHub ${authorization ? "OAuth app" : "anonymous"} rate limit reached (HTTP ${response.status}).${retry}${authorization ? "" : " Configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET on the Convex deployment for authenticated public discovery."}`
      : `GitHub discovery failed (HTTP ${response.status}): ${detail.slice(0, 1000)}${response.status === 401 || response.status === 403 ? " Check the server-side GitHub OAuth app credentials and access." : ""}`;
    const diagnostic = {
      code: "GITHUB_DISCOVERY_FAILED",
      message,
      status: response.status,
      endpoint: url,
      rateLimit,
      body,
    };
    console.error("GitHub discovery failed", diagnostic);
    throw new ConvexError(diagnostic);
  }
  return response.json();
}

export const discoverEnvironment = action({
  args: {},
  handler: async (ctx) => {
    await requireOwnerIdentity(ctx);
    const repoUrl = readRepoUrl();
    const { owner, repo } = githubRepo(repoUrl);
    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;
    const commit = (await githubJson(`${apiBase}/commits/HEAD`)) as { sha: string };
    const tree = (await githubJson(`${apiBase}/git/trees/${commit.sha}?recursive=1`)) as {
      tree: { path: string; type: string; size?: number }[];
      truncated?: boolean;
    };
    if (tree.truncated) throw new ConvexError("Repository tree is too large for discovery");
    const allPaths = tree.tree.filter((item) => item.type === "blob").map((item) => item.path);
    const fetchPaths = tree.tree
      .filter(
        (item) => item.type === "blob" && (item.size ?? 0) <= 200_000 && shouldFetch(item.path),
      )
      .slice(0, 150)
      .map((item) => item.path);
    const files: Record<string, string> = {};
    await Promise.all(
      fetchPaths.map(async (path) => {
        const encodedPath = path.split("/").map(encodeURIComponent).join("/");
        let response: Response;
        try {
          response = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/${commit.sha}/${encodedPath}`,
          );
        } catch {
          throw new ConvexError(
            `Discovery could not reach GitHub while reading ${path}. Try again shortly.`,
          );
        }
        if (!response.ok)
          throw new ConvexError(
            `Discovery could not read ${path} (HTTP ${response.status}). Try again.`,
          );
        files[path] = await response.text();
      }),
    );
    const result = inspectEnvironment(files, allPaths);
    const { candidates, ...detected } = result;
    await ctx.runMutation(internal.environment.recordDiscovery, {
      repoUrl,
      latestCommitSha: commit.sha,
      detected,
      candidates,
    });
    return { detected, candidates, latestCommitSha: commit.sha };
  },
});

export const getForProvision = internalQuery({
  args: {},
  handler: async (ctx) => getProfile(ctx),
});

export const recordClonedCommit = internalMutation({
  args: { commitSha: v.string() },
  handler: async (ctx, { commitSha }) => {
    const profile = await getProfile(ctx);
    if (profile)
      await ctx.db.patch(profile._id, {
        latestCommitSha: commitSha,
        updatedAt: Date.now(),
      });
  },
});

export async function applyVerified(
  ctx: MutationCtx,
  args: { profileVersion: number; commitSha: string; durationMs: number },
) {
  const profile = await getProfile(ctx);
  if (!profile || profile.version !== args.profileVersion) return false;
  const now = Date.now();
  await ctx.db.patch(profile._id, {
    status: "ready",
    latestCommitSha: args.commitSha,
    lastVerifiedAt: now,
    lastError: undefined,
    lastMissingVariables: undefined,
    verified: {
      version: profile.version,
      commitSha: args.commitSha,
      config: configOf(profile),
      durationMs: args.durationMs,
      verifiedAt: now,
    },
    updatedAt: now,
  });
  return true;
}

export const recordVerified = internalMutation({
  args: {
    profileVersion: v.number(),
    commitSha: v.string(),
    durationMs: v.number(),
  },
  handler: async (ctx, args) => applyVerified(ctx, args),
});

export async function applyFailure(
  ctx: MutationCtx,
  args: { profileVersion: number; error: string; missingVariables: string[] },
) {
  const profile = await getProfile(ctx);
  if (!profile || profile.version !== args.profileVersion) return false;
  await ctx.db.patch(profile._id, {
    status: "failed",
    lastError: args.error.slice(-4000),
    lastMissingVariables: args.missingVariables,
    updatedAt: Date.now(),
  });
  return true;
}

export const recordFailure = internalMutation({
  args: {
    profileVersion: v.number(),
    error: v.string(),
    missingVariables: v.array(v.string()),
  },
  handler: async (ctx, args) => applyFailure(ctx, args),
});

export const seedProfile = internalMutation({
  args: {
    repoUrl: v.string(),
    commitSha: v.string(),
    installCommand: v.string(),
    startCommand: v.string(),
    port: v.number(),
    healthPath: v.string(),
    previewMode: v.boolean(),
    workingDirectory: v.optional(v.string()),
    variables: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\.git)?$/.test(args.repoUrl))
      throw new ConvexError("Repository must be a public GitHub HTTPS URL");
    if (!/^[0-9a-f]{7,40}$/i.test(args.commitSha))
      throw new ConvexError("commitSha must be a git SHA");
    const existing = await getProfile(ctx);
    const now = Date.now();
    const names = [...new Set(args.variables ?? [])];
    const fields = {
      repoUrl: args.repoUrl,
      commitSha: args.commitSha,
      workingDirectory: args.workingDirectory?.trim() || ".",
      installCommand: validateCommand(args.installCommand, "install command"),
      startCommand: validateCommand(args.startCommand, "start command"),
      port: args.port,
      healthPath: args.healthPath,
      previewMode: args.previewMode,
      variables: names.map((name) => ({ name, source: sourceForVariable(name) })),
      version: Math.max(1, (existing?.version ?? 0) + 1),
      status: "unverified" as const,
      latestCommitSha: args.commitSha,
      lastError: undefined,
      lastMissingVariables: undefined,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return ctx.db.insert("environmentProfiles", {
      singleton: SINGLETON,
      ...fields,
    });
  },
});
