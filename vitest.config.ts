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
          name: "environment",
          environment: "node",
          include: ["packages/environment/src/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "server",
          environment: "node",
          include: ["apps/server/src/**/*.test.ts"],
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
