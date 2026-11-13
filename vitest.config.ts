import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "convex",
          environment: "edge-runtime",
          include: ["convex/**/*.test.ts"],
          exclude: ["convex/lib/runSandboxJob.test.ts", "convex/workspaceActions.test.ts"],
          server: {
            deps: {
              inline: ["convex-test", "@convex-dev/better-auth"],
            },
          },
        },
        resolve: {
          alias: {
            "@convex": path.resolve(import.meta.dirname, "convex"),
          },
        },
      },
      {
        test: {
          name: "sandbox-node",
          environment: "node",
          include: ["convex/lib/runSandboxJob.test.ts", "convex/workspaceActions.test.ts"],
        },
      },
      {
        test: {
          name: "react",
          environment: "jsdom",
          include: ["packages/react/src/**/*.test.tsx"],
        },
      },
    ],
  },
});
