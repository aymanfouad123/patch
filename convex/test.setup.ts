/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import betterAuthTest from "@convex-dev/better-auth/test";
import schema from "./schema";

export const modules = import.meta.glob([
  "./**/*.ts",
  "!./**/*.test.ts",
  "!./test.setup.ts",
]);

export function createTestConvex() {
  const t = convexTest(schema, modules);
  const component = betterAuthTest.register(t);
  return { t, component };
}

export const OWNER_GITHUB_ID = "123456";
