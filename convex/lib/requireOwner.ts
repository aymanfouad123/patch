import { ConvexError } from "convex/values";
import type { GenericCtx } from "@convex-dev/better-auth";
import { components } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { authComponent } from "../auth";
import { readOwnerGithubId } from "./owner";

export type ViewerUser = {
  name: string;
  image?: string | null;
};

export type OwnerStatus =
  | { status: "signedOut" }
  | { status: "unauthorized" }
  | { status: "authorized"; user: ViewerUser };

export async function getOwnerStatus(
  ctx: GenericCtx<DataModel>,
): Promise<OwnerStatus> {
  const user = await authComponent.safeGetAuthUser(ctx);
  if (!user) {
    return { status: "signedOut" };
  }

  const ownerId = readOwnerGithubId();
  if (!ownerId) {
    return { status: "unauthorized" };
  }

  const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "account",
    where: [
      { field: "userId", value: user._id },
      { field: "providerId", value: "github" },
      { field: "accountId", value: ownerId },
    ],
  });

  if (!account) {
    return { status: "unauthorized" };
  }

  return {
    status: "authorized",
    user: {
      name: user.name,
      image: user.image ?? null,
    },
  };
}

export async function requireOwner(ctx: GenericCtx<DataModel>) {
  const result = await getOwnerStatus(ctx);
  if (result.status === "signedOut") {
    throw new ConvexError({ code: "UNAUTHENTICATED" });
  }
  if (result.status === "unauthorized") {
    throw new ConvexError({ code: "FORBIDDEN" });
  }
  return result.user;
}
