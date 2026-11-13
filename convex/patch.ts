import { query } from "./_generated/server";
import { getOwnerStatus, requireOwner } from "./lib/requireOwner";

/** Soft auth probe for the widget. Never throws. */
export const getViewer = query({
  args: {},
  handler: async (ctx) => {
    return await getOwnerStatus(ctx);
  },
});

/** Protected auth check. Throws when the caller is not the owner. */
export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireOwner(ctx);
    return { user };
  },
});
