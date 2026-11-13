import { describe, expect, it } from "vitest";
import {
  detectMissingVariables,
  discoverEnvironment,
  isBlockedVariableName,
  redact,
  resolveApprovedEnv,
  sourceForVariable,
} from "./environment";

describe("environment discovery", () => {
  it("detects commands and candidates without treating candidates as approved", () => {
    const result = discoverEnvironment(
      {
        "package.json": JSON.stringify({
          packageManager: "pnpm@12.8.1",
          engines: { node: ">=20" },
          scripts: { dev: "next dev" },
        }),
        ".env.example": "NEXT_PUBLIC_CONVEX_URL=\nVERCEL_TOKEN=\n",
        "app/page.tsx": "process.env.NEXT_PUBLIC_CONVEX_SITE_URL; process.env.RUNTIME_ONLY",
      },
      ["package.json", "pnpm-lock.yaml", ".env.example", ".env.local", "app/page.tsx"],
    );

    expect(result).toMatchObject({
      packageManager: "pnpm@12.8.1",
      installCommand: "pnpm install --frozen-lockfile",
      startCommand: "pnpm dev --hostname 0.0.0.0 --port 3000",
    });
    expect(result.candidates.map((candidate) => candidate.name)).toEqual([
      "NEXT_PUBLIC_CONVEX_SITE_URL",
      "NEXT_PUBLIC_CONVEX_URL",
      "RUNTIME_ONLY",
      "VERCEL_TOKEN",
    ]);
    expect(result.candidates.find((candidate) => candidate.name === "VERCEL_TOKEN")).toMatchObject({
      blocked: true,
    });
  });

  it("detects missing names in startup diagnostics and redacts values", () => {
    expect(
      detectMissingVariables("Error: Missing environment variable NEXT_PUBLIC_CONVEX_URL", [
        "NEXT_PUBLIC_CONVEX_URL",
        "OTHER",
      ]),
    ).toEqual(["NEXT_PUBLIC_CONVEX_URL"]);
    expect(redact("failed with secret-value", ["secret-value"])).toBe("failed with [REDACTED]");
  });
});

describe("approved environment resolution", () => {
  it("does not require or inject approved values in preview mode", () => {
    expect(
      resolveApprovedEnv(
        {
          previewMode: true,
          variables: [
            {
              name: "NEXT_PUBLIC_CONVEX_URL",
              source: sourceForVariable("NEXT_PUBLIC_CONVEX_URL"),
            },
          ],
        },
        {},
      ),
    ).toEqual({
      creationEnv: { NEXT_TELEMETRY_DISABLED: "1", PATCH_PREVIEW_MODE: "1" },
      commandEnv: {},
      missing: [],
      rejected: [],
      allowHosts: [],
    });
  });

  it("allowlists only mapped values and rejects host credentials", () => {
    const resolved = resolveApprovedEnv(
      {
        previewMode: false,
        variables: [
          {
            name: "NEXT_PUBLIC_CONVEX_URL",
            source: "PATCH_DEV_NEXT_PUBLIC_CONVEX_URL",
          },
          { name: "VERCEL_TOKEN", source: "PATCH_DEV_VERCEL_TOKEN" },
          { name: "OTHER", source: "PATCH_DEV_OTHER" },
        ],
      },
      {
        PATCH_DEV_NEXT_PUBLIC_CONVEX_URL: "https://dev.convex.cloud",
        PATCH_DEV_VERCEL_TOKEN: "different",
        PATCH_DEV_OTHER: "production-secret",
        BETTER_AUTH_SECRET: "production-secret",
        UNRELATED: "never-forward",
      },
    );
    expect(resolved.commandEnv).toEqual({
      NEXT_PUBLIC_CONVEX_URL: "https://dev.convex.cloud",
    });
    expect(resolved.allowHosts).toEqual(["dev.convex.cloud"]);
    expect(resolved.rejected).toEqual(["VERCEL_TOKEN", "OTHER"]);
    expect(resolved.commandEnv).not.toHaveProperty("UNRELATED");
    expect(isBlockedVariableName("VERCEL_TOKEN")).toBe(true);
  });
});
