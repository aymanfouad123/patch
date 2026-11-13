/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as environment from "../environment.js";
import type * as http from "../http.js";
import type * as lib_environment from "../lib/environment.js";
import type * as lib_owner from "../lib/owner.js";
import type * as lib_requireOwner from "../lib/requireOwner.js";
import type * as lib_runSandboxJob from "../lib/runSandboxJob.js";
import type * as lib_sandboxCredentials from "../lib/sandboxCredentials.js";
import type * as patch from "../patch.js";
import type * as sandbox from "../sandbox.js";
import type * as sandboxActions from "../sandboxActions.js";
import type * as workspaceActions from "../workspaceActions.js";
import type * as workspaces from "../workspaces.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  environment: typeof environment;
  http: typeof http;
  "lib/environment": typeof lib_environment;
  "lib/owner": typeof lib_owner;
  "lib/requireOwner": typeof lib_requireOwner;
  "lib/runSandboxJob": typeof lib_runSandboxJob;
  "lib/sandboxCredentials": typeof lib_sandboxCredentials;
  patch: typeof patch;
  sandbox: typeof sandbox;
  sandboxActions: typeof sandboxActions;
  workspaceActions: typeof workspaceActions;
  workspaces: typeof workspaces;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
