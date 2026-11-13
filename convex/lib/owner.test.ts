import { describe, expect, it } from "vitest";
import {
  assertAccountAllowed,
  assertBootstrapOpen,
  isOwnerIdentity,
  readOwnerGithubId,
} from "./owner";

describe("readOwnerGithubId", () => {
  it("returns null for missing, empty, or non-numeric values", () => {
    expect(readOwnerGithubId(undefined)).toBeNull();
    expect(readOwnerGithubId("")).toBeNull();
    expect(readOwnerGithubId("abc")).toBeNull();
    expect(readOwnerGithubId("12.3")).toBeNull();
    expect(readOwnerGithubId("-1")).toBeNull();
  });

  it("returns the numeric GitHub id string", () => {
    expect(readOwnerGithubId("123456")).toBe("123456");
  });
});

describe("isOwnerIdentity", () => {
  it("rejects when owner id is missing", () => {
    expect(
      isOwnerIdentity(
        {
          method: "oauth",
          oauth: { providerId: "github", profile: { id: 123456 } },
        },
        null,
      ),
    ).toBe(false);
  });

  it("rejects non-GitHub and non-oauth methods", () => {
    expect(
      isOwnerIdentity(
        {
          method: "email-password",
        },
        "123456",
      ),
    ).toBe(false);
    expect(
      isOwnerIdentity(
        {
          method: "oauth",
          oauth: { providerId: "google", profile: { id: 123456 } },
        },
        "123456",
      ),
    ).toBe(false);
  });

  it("rejects the wrong GitHub identity", () => {
    expect(
      isOwnerIdentity(
        {
          method: "oauth",
          oauth: { providerId: "github", profile: { id: 999 } },
        },
        "123456",
      ),
    ).toBe(false);
  });

  it("accepts the owner GitHub identity", () => {
    expect(
      isOwnerIdentity(
        {
          method: "oauth",
          oauth: { providerId: "github", profile: { id: 123456 } },
        },
        "123456",
      ),
    ).toBe(true);
    expect(
      isOwnerIdentity(
        {
          method: "oauth",
          oauth: { providerId: "github", profile: { id: "123456" } },
        },
        "123456",
      ),
    ).toBe(true);
  });
});

describe("assertAccountAllowed", () => {
  it("rejects missing owner config and wrong accounts", () => {
    expect(
      assertAccountAllowed(
        { providerId: "github", accountId: "123456" },
        null,
      ),
    ).toBe(false);
    expect(
      assertAccountAllowed(
        { providerId: "github", accountId: "999" },
        "123456",
      ),
    ).toBe(false);
    expect(
      assertAccountAllowed(
        { providerId: "google", accountId: "123456" },
        "123456",
      ),
    ).toBe(false);
  });

  it("accepts the owner GitHub account", () => {
    expect(
      assertAccountAllowed(
        { providerId: "github", accountId: "123456" },
        "123456",
      ),
    ).toBe(true);
  });
});

describe("assertBootstrapOpen", () => {
  it("allows the first user and rejects later signups", () => {
    expect(assertBootstrapOpen(0)).toBe(true);
    expect(assertBootstrapOpen(1)).toBe(false);
    expect(assertBootstrapOpen(5)).toBe(false);
  });
});
