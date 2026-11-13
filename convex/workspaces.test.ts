import { expect, it } from "vitest";
import { createTestConvex } from "./test.setup";
import { api, internal } from "./_generated/api";
it("requires authentication for workspace endpoints", async () => {
  const { t } = createTestConvex();
  await expect(t.mutation(api.workspaces.startWorkspace, {})).rejects.toMatchObject({
    data: { code: "UNAUTHENTICATED" },
  });
  await expect(t.query(api.workspaces.latestWorkspace, {})).rejects.toMatchObject({
    data: { code: "UNAUTHENTICATED" },
  });
});
it("rejects late readiness and expires persisted sessions", async () => {
  const { t } = createTestConvex();
  const id = await t.run((ctx) =>
    ctx.db.insert("workspaces", {
      ownerUserId: "owner",
      repoUrl: "https://github.com/example/patch",
      sandboxName: "test",
      status: "starting",
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await t.mutation(internal.workspaces.expire, { id });
  expect(
    await t.mutation(internal.workspaces.advance, {
      id,
      expected: "starting",
      status: "ready",
      previewUrl: "https://example.com",
    }),
  ).toBe(false);
  await t.mutation(internal.workspaces.cleaned, { id });
  expect(await t.query(internal.workspaces.get, { id })).toMatchObject({
    status: "expired",
    active: false,
  });
});
