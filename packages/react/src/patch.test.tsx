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
