export type EnvironmentStage = "install" | "build" | "runtime";

export type EnvironmentCandidate = {
  name: string;
  stages: EnvironmentStage[];
  files: string[];
  blocked: boolean;
};

export type EnvironmentConfig = {
  repoUrl: string;
  installCommand: string;
  startCommand: string;
  port: number;
  healthPath: string;
  previewMode: boolean;
  variables: { name: string; source: string }[];
};

export type DiscoveredEnvironment = {
  runtime: string;
  packageManager: string;
  installCommand: string;
  startCommand: string;
  port: number;
  healthPath: string;
  candidates: EnvironmentCandidate[];
};

const BLOCKED_EXACT = new Set([
  "BETTER_AUTH_SECRET",
  "SITE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "PATCH_OWNER_GITHUB_ID",
  "PATCH_REPO_URL",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT",
  "PATH",
  "NODE_OPTIONS",
  "PATCH_PREVIEW_MODE",
]);

export function isValidVariableName(name: string) {
  return /^[A-Z_][A-Z0-9_]*$/.test(name);
}

export function isBlockedVariableName(name: string) {
  return (
    BLOCKED_EXACT.has(name) ||
    name.startsWith("VERCEL_") ||
    name.startsWith("LD_") ||
    !isValidVariableName(name)
  );
}

export function sourceForVariable(name: string) {
  return `PATCH_DEV_${name}`;
}

function stagesFor(path: string, name: string): EnvironmentStage[] {
  if (name.startsWith("NEXT_PUBLIC_")) return ["build", "runtime"];
  if (/next\.config\.[cm]?[jt]s$/.test(path)) return ["build"];
  if (path.endsWith("package.json")) return ["install", "build"];
  return ["runtime"];
}

function mergeCandidate(
  candidates: Map<string, { stages: Set<EnvironmentStage>; files: Set<string> }>,
  name: string,
  path: string,
) {
  if (!isValidVariableName(name)) return;
  const item = candidates.get(name) ?? { stages: new Set(), files: new Set() };
  for (const stage of stagesFor(path, name)) item.stages.add(stage);
  item.files.add(path);
  candidates.set(name, item);
}

function readEnvTemplate(content: string) {
  const names: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/);
    if (match) names.push(match[1]);
  }
  return names;
}

function commandFromScripts(
  packageManager: string,
  scripts: Record<string, unknown>,
  name: "dev" | "start",
) {
  if (typeof scripts[name] !== "string") return undefined;
  return `${packageManager} ${name}`;
}

export function discoverEnvironment(
  files: Record<string, string>,
  paths: string[] = Object.keys(files),
): DiscoveredEnvironment {
  const rootPackage = JSON.parse(files["package.json"] ?? "{}") as {
    packageManager?: string;
    engines?: { node?: string };
    scripts?: Record<string, unknown>;
  };
  const packageManagerSpec =
    rootPackage.packageManager ??
    (paths.includes("pnpm-lock.yaml")
      ? "pnpm"
      : paths.includes("yarn.lock")
        ? "yarn"
        : paths.includes("bun.lockb") || paths.includes("bun.lock")
          ? "bun"
          : "npm");
  const packageManager = packageManagerSpec.split("@")[0];
  const installCommand =
    packageManager === "pnpm"
      ? "pnpm install --frozen-lockfile"
      : packageManager === "yarn"
        ? "yarn install --frozen-lockfile"
        : packageManager === "bun"
          ? "bun install --frozen-lockfile"
          : paths.includes("package-lock.json")
            ? "npm ci"
            : "npm install";
  const scripts = rootPackage.scripts ?? {};
  const startBase =
    commandFromScripts(packageManager, scripts, "dev") ??
    commandFromScripts(packageManager, scripts, "start") ??
    `${packageManager} dev`;
  const startCommand = `${startBase} --hostname 0.0.0.0 --port 3000`;
  const candidates = new Map<string, { stages: Set<EnvironmentStage>; files: Set<string> }>();

  for (const [path, content] of Object.entries(files)) {
    if (/^\.env\.(?:example|sample|template)$/.test(path.split("/").pop() ?? "")) {
      for (const name of readEnvTemplate(content)) mergeCandidate(candidates, name, path);
    }
    for (const match of content.matchAll(/\bprocess\.env\.([A-Z_][A-Z0-9_]*)\b/g)) {
      mergeCandidate(candidates, match[1], path);
    }
    for (const match of content.matchAll(/\bprocess\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g)) {
      mergeCandidate(candidates, match[1], path);
    }
  }

  return {
    runtime: `node ${rootPackage.engines?.node ?? "unspecified"}`,
    packageManager: packageManagerSpec,
    installCommand,
    startCommand,
    port: 3000,
    healthPath: "/",
    candidates: [...candidates.entries()]
      .map(([name, value]) => ({
        name,
        stages: [...value.stages],
        files: [...value.files].sort(),
        blocked: isBlockedVariableName(name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

const HOST_CONVEX_NAMES = ["CONVEX_CLOUD_URL", "CONVEX_SITE_URL"] as const;
const CREDENTIAL_NAMES = [
  "BETTER_AUTH_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "PATCH_OWNER_GITHUB_ID",
  "VERCEL_TOKEN",
  "VERCEL_TEAM_ID",
  "VERCEL_PROJECT_ID",
] as const;

export function resolveApprovedEnv(
  config: Pick<EnvironmentConfig, "previewMode" | "variables">,
  hostEnv: NodeJS.ProcessEnv,
) {
  const commandEnv: Record<string, string> = {};
  const missing: string[] = [];
  const rejected: string[] = [];
  const sensitiveHostValues = [...HOST_CONVEX_NAMES, ...CREDENTIAL_NAMES]
    .map((name) => hostEnv[name]?.trim())
    .filter((value): value is string => Boolean(value));

  if (!config.previewMode) {
    for (const variable of config.variables) {
      if (
        isBlockedVariableName(variable.name) ||
        variable.source !== sourceForVariable(variable.name)
      ) {
        rejected.push(variable.name);
        continue;
      }
      const value = hostEnv[variable.source]?.trim();
      if (!value) {
        missing.push(variable.name);
      } else if (sensitiveHostValues.includes(value)) {
        rejected.push(variable.name);
      } else {
        commandEnv[variable.name] = value;
      }
    }
  }

  const allowHosts = [
    ...new Set(
      Object.values(commandEnv).flatMap((value) => {
        try {
          return [new URL(value).hostname];
        } catch {
          return [];
        }
      }),
    ),
  ];

  return {
    creationEnv: {
      NEXT_TELEMETRY_DISABLED: "1",
      ...(config.previewMode ? { PATCH_PREVIEW_MODE: "1" } : {}),
    },
    commandEnv,
    missing,
    rejected,
    allowHosts,
  };
}

export function detectMissingVariables(log: string, candidateNames: string[]) {
  const found = new Set<string>();
  const known = new Set(candidateNames);
  for (const match of log.matchAll(
    /(?:missing(?:\s+required)?\s+(?:environment\s+)?variable|environment variable|env(?:ironment)? variable)\s*[:'"]?\s*([A-Z_][A-Z0-9_]*)/gi,
  )) {
    if (known.size === 0 || known.has(match[1])) found.add(match[1]);
  }
  for (const name of known) {
    if (
      new RegExp(
        `(?:${name}.{0,80}(?:missing|required|undefined|not set)|(?:missing|required|undefined|not set).{0,80}${name})`,
        "i",
      ).test(log)
    )
      found.add(name);
  }
  return [...found].sort();
}

export function redact(text: string, values: string[]) {
  let result = text;
  for (const value of [...values].filter(Boolean).sort((a, b) => b.length - a.length)) {
    result = result.split(value).join("[REDACTED]");
  }
  return result.slice(-4000);
}
