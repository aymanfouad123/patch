import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { APIError } from "better-auth/api";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
import {
  assertAccountAllowed,
  assertBootstrapOpen,
  isOwnerIdentity,
  readOwnerGithubId,
} from "./lib/owner";

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    baseURL: process.env.SITE_URL!,
    database: authComponent.adapter(ctx),
    emailAndPassword: {
      enabled: false,
    },
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
      },
    },
    account: {
      accountLinking: {
        enabled: false,
      },
    },
    user: {
      validateUserInfo: async ({ source }) => {
        const ownerId = readOwnerGithubId();
        if (!isOwnerIdentity(source, ownerId)) {
          return {
            error: "access_denied",
            errorDescription: "Only the configured owner can use Patch.",
          };
        }
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (_user, hookCtx) => {
            if (!hookCtx) {
              throw new APIError("FORBIDDEN", {
                message: "signup_disabled",
              });
            }
            const ownerId = readOwnerGithubId();
            if (!ownerId) {
              throw new APIError("FORBIDDEN", {
                message: "signup_disabled",
              });
            }
            const userCount =
              await hookCtx.context.internalAdapter.countTotalUsers();
            if (!assertBootstrapOpen(userCount)) {
              throw new APIError("FORBIDDEN", {
                message: "signup_disabled",
              });
            }
          },
        },
      },
      account: {
        create: {
          before: async (account) => {
            const ownerId = readOwnerGithubId();
            if (!assertAccountAllowed(account, ownerId)) {
              throw new APIError("FORBIDDEN", {
                message: "access_denied",
              });
            }
          },
        },
      },
      session: {
        create: {
          before: async (session, hookCtx) => {
            if (!hookCtx) {
              throw new APIError("FORBIDDEN", {
                message: "access_denied",
              });
            }
            const ownerId = readOwnerGithubId();
            if (!ownerId) {
              throw new APIError("FORBIDDEN", {
                message: "access_denied",
              });
            }
            const accounts = await hookCtx.context.internalAdapter.findAccounts(
              session.userId,
            );
            const hasOwnerAccount = accounts.some((account) =>
              assertAccountAllowed(account, ownerId),
            );
            if (!hasOwnerAccount) {
              throw new APIError("FORBIDDEN", {
                message: "access_denied",
              });
            }
          },
        },
      },
    },
    plugins: [convex({ authConfig })],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};
