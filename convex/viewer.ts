import { query } from "./_generated/server";
import { getOwnerStatus, requireOwner } from "./lib/requireOwner";

export const get = query({
  args: {},
  handler: async (ctx) => {
    return await getOwnerStatus(ctx);
  },
});

export const require = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);
    return { user };
  },
});
