"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AgentPanel, type AgentPanelProps } from "./agent-panel";
import { cn } from "./lib/utils";

export type PatchProps = Pick<AgentPanelProps, "onPrompt"> & { className?: string };

export function Patch({ className, onPrompt }: PatchProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button aria-label="Open Patch assistant" className={cn("group fixed right-6 bottom-6 z-40 grid size-16 cursor-pointer place-items-center rounded-[42%_58%_56%_44%/48%_42%_58%_52%] bg-[#b7a1ee] text-[#352255] shadow-[0_6px_24px_-4px_#7860aa66,inset_0_2px_3px_#ffffff90] transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-600 motion-reduce:transition-none sm:right-8 sm:bottom-8", className)}>
          <span aria-hidden="true" className="flex gap-2 transition-transform group-hover:-rotate-12"><span className="h-3 w-[5px] rounded-full bg-current" /><span className="h-3 w-[5px] rounded-full bg-current" /></span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 motion-reduce:animate-none" />
        <AgentPanel onPrompt={onPrompt} />
      </Dialog.Portal>
    </Dialog.Root>
  );
}
