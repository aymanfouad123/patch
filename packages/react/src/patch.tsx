"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AccessDeniedPanel } from "./access-denied-panel";
import { AgentPanel, type AgentPanelProps } from "./agent-panel";
import type { PatchAuth } from "./auth";
import { LoadingPanel } from "./loading-panel";
import { cn } from "./lib/utils";
import { UnlockPanel } from "./unlock-panel";

export type PatchProps = Pick<AgentPanelProps, "onPrompt" | "run" | "environment"> & {
  className?: string;
  /** Injected auth state. Omit to keep the open demo panel. */
  auth?: PatchAuth;
};

export function Patch({ className, onPrompt, auth, run, environment }: PatchProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open Patch assistant"
          className={cn(
            "group fixed right-6 bottom-6 z-40 flex size-14 items-center justify-center rounded-full bg-[#7961aa] text-white shadow-lg transition hover:scale-105 hover:bg-[#654c96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7961aa] focus-visible:ring-offset-2",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="flex gap-2 transition-transform group-hover:-rotate-12"
          >
            <span className="h-3 w-[5px] rounded-full bg-current" />
            <span className="h-3 w-[5px] rounded-full bg-current" />
          </span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        {!auth ? (
          <AgentPanel onPrompt={onPrompt} run={run} environment={environment} />
        ) : auth.status === "loading" ? (
          <LoadingPanel />
        ) : auth.status === "signedOut" ? (
          <UnlockPanel onSignIn={auth.signIn} />
        ) : auth.status === "unauthorized" ? (
          <AccessDeniedPanel onSignOut={auth.signOut} />
        ) : (
          <AgentPanel
            onPrompt={onPrompt}
            onSignOut={auth.signOut}
            run={run}
            environment={environment}
          />
        )}
      </Dialog.Portal>
    </Dialog.Root>
  );
}
