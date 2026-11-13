import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Patch } from "./patch";

afterEach(() => {
  cleanup();
  document.body.removeAttribute("style");
  document.body.removeAttribute("data-scroll-locked");
});

async function openPatch() {
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  await user.click(screen.getByRole("button", { name: "Open Patch assistant" }));
  return user;
}

describe("Patch auth states", () => {
  it("renders the agent pane when auth is omitted", async () => {
    render(<Patch />);
    await openPatch();
    expect(screen.getByLabelText("Message Patch")).toBeTruthy();
  });

  it("shows Unlock Patch and calls signIn", async () => {
    const signIn = vi.fn();
    render(<Patch auth={{ status: "signedOut", signIn }} />);
    const user = await openPatch();
    expect(screen.getByText("Unlock Patch")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Continue with GitHub" }));
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("shows Access denied for unauthorized users", async () => {
    const signOut = vi.fn();
    render(<Patch auth={{ status: "unauthorized", signOut }} />);
    const user = await openPatch();
    expect(screen.getByText("Access denied")).toBeTruthy();
    await user.click(screen.getByText("Sign out", { selector: "button" }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("shows the agent pane when authorized and supports sign-out", async () => {
    const signOut = vi.fn();
    render(
      <Patch
        auth={{
          status: "authorized",
          signOut,
          user: { name: "Owner" },
        }}
      />,
    );
    const user = await openPatch();
    expect(screen.getByLabelText("Message Patch")).toBeTruthy();
    await user.click(screen.getByLabelText("Sign out"));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("starts a sandbox test from the authorized pane", async () => {
    const signOut = vi.fn();
    const onStart = vi.fn();
    render(
      <Patch
        auth={{
          status: "authorized",
          signOut,
          user: { name: "Owner" },
        }}
        sandbox={{
          job: {
            status: "completed",
            active: false,
            stdout: "v22.11.0\n",
          },
          starting: false,
          onStart,
        }}
      />,
    );
    const user = await openPatch();
    expect(screen.getByText("Status: Completed")).toBeTruthy();
    expect(screen.getByText("v22.11.0")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Test sandbox" }));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it("shows a loading state while auth resolves", async () => {
    render(<Patch auth={{ status: "loading" }} />);
    await openPatch();
    expect(screen.getByText("Checking access…")).toBeTruthy();
  });
});

it("opens a ready workspace preview and stops the workspace", async () => {
  const onStop = vi.fn(async () => {});
  render(
    <Patch
      workspace={{
        workspace: {
          _id: "workspace",
          status: "ready",
          active: true,
          previewUrl: "https://preview.example",
        },
        onStart: vi.fn(),
        onStop,
      }}
    />,
  );
  const user = await openPatch();
  expect(screen.getByRole("link", { name: "Open preview" }).getAttribute("href")).toBe(
    "https://preview.example",
  );
  expect(
    (screen.getByRole("button", { name: "Start workspace" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Stop workspace" }));
  expect(onStop).toHaveBeenCalledOnce();
});

it("shows environment candidates and prepares the environment", async () => {
  const onPrepare = vi.fn(async () => {});
  render(
    <Patch
      environment={{
        environment: {
          installCommand: "pnpm install",
          startCommand: "pnpm dev",
          port: 3000,
          healthPath: "/",
          previewMode: false,
          version: 2,
          status: "failed",
          verification: "failed",
          variables: [{ name: "NEXT_PUBLIC_CONVEX_URL", configured: false }],
          candidates: [
            {
              name: "NEXT_PUBLIC_CONVEX_URL",
              stages: ["build", "runtime"],
              blocked: false,
            },
          ],
          lastMissingVariables: ["NEXT_PUBLIC_CONVEX_URL"],
          lastError: "Application did not start",
        },
        onDiscover: vi.fn(async () => {}),
        onSave: vi.fn(async () => {}),
        onPrepare,
      }}
    />,
  );
  const user = await openPatch();
  expect(screen.getByText("Reported missing at startup: NEXT_PUBLIC_CONVEX_URL")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Application did not start");
  await user.click(screen.getByRole("button", { name: "Prepare environment" }));
  expect(onPrepare).toHaveBeenCalledOnce();
});

it("shows actionable discovery errors and requires saving a draft before preparation", async () => {
  render(
    <Patch
      environment={{
        environment: {
          installCommand: "pnpm install",
          startCommand: "pnpm dev",
          port: 3000,
          healthPath: "/",
          previewMode: true,
          version: 0,
          status: "unverified",
          verification: "unverified",
          variables: [],
        },
        onDiscover: async () => {
          throw {
            data: {
              code: "GITHUB_DISCOVERY_FAILED",
              message: "GitHub anonymous rate limit reached (HTTP 403). Retry after reset.",
            },
          };
        },
        onSave: vi.fn(async () => {}),
        onPrepare: vi.fn(async () => {}),
      }}
    />,
  );
  const user = await openPatch();
  expect(
    (screen.getByRole("button", { name: "Prepare environment" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Discover" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Discovery failed: GitHub anonymous rate limit reached (HTTP 403). Retry after reset.",
  );
});

it("labels old workspace failures as history while showing current environment status", async () => {
  render(
    <Patch
      environment={{
        environment: {
          installCommand: "pnpm install",
          startCommand: "pnpm dev",
          port: 3000,
          healthPath: "/",
          previewMode: true,
          version: 1,
          status: "preparing",
          verification: "preparing",
          variables: [],
        },
        onDiscover: vi.fn(async () => {}),
        onSave: vi.fn(async () => {}),
        onPrepare: vi.fn(async () => {}),
      }}
      workspace={{
        workspace: {
          _id: "old",
          status: "failed",
          active: false,
          error: "CONVEX_SITE_URL is not set",
        },
        onStart: vi.fn(async () => {}),
        onStop: vi.fn(async () => {}),
      }}
    />,
  );
  await openPatch();
  expect(screen.getByRole("status").textContent).toBe("Previous workspace: failed");
  expect(screen.getByText("preparing")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Previous workspace error").parentElement?.tagName).toBe("DETAILS");
});
