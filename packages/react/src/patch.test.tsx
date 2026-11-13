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

  it("shows a loading state while auth resolves", async () => {
    render(<Patch auth={{ status: "loading" }} />);
    await openPatch();
    expect(screen.getByText("Checking access…")).toBeTruthy();
  });
});

it("shows a ready run preview and cancels the run", async () => {
  const onCancel = vi.fn(async () => {});
  render(
    <Patch
      run={{
        run: {
          id: "runs_1",
          status: "ready",
          stage: "checking_readiness",
          active: true,
          previewUrl: "https://preview.example",
          readyUntil: Date.now() + 60_000,
        },
        onCancel,
      }}
    />,
  );
  const user = await openPatch();
  expect(screen.getByText(/Run: ready/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open preview" }).getAttribute("href")).toBe(
    "https://preview.example",
  );
  await user.click(screen.getByRole("button", { name: "Cancel run" }));
  expect(onCancel).toHaveBeenCalledOnce();
});

it("shows environment candidates and prepares the environment", async () => {
  const onDiscover = vi.fn(async () => {});
  const onSave = vi.fn(async () => {});
  const onPrepare = vi.fn(async () => {});
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
          status: "unverified",
          verification: "unverified",
          variables: [],
          candidates: [{ name: "DEMO", stages: ["runtime"], blocked: false }],
        },
        onDiscover,
        onSave,
        onPrepare,
      }}
    />,
  );
  const user = await openPatch();
  expect(screen.getByText("DEMO")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Discover" }));
  expect(onDiscover).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Prepare environment" }));
  expect(onPrepare).toHaveBeenCalledOnce();
});

it("shows actionable discovery errors and requires saving a draft before preparation", async () => {
  const onDiscover = vi.fn(async () => {
    throw new Error("GitHub rate limit reached");
  });
  const onSave = vi.fn(async () => {});
  const onPrepare = vi.fn(async () => {});
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
        onDiscover,
        onSave,
        onPrepare,
      }}
    />,
  );
  const user = await openPatch();
  await user.click(screen.getByRole("button", { name: "Discover" }));
  expect(screen.getByText(/GitHub rate limit reached/)).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Prepare environment" }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
