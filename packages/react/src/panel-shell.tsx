"use client";

import type { ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { LogOut, X } from "lucide-react";
import { Button } from "./components/ui/button";

export type PanelShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  onSignOut?: () => void | Promise<void>;
};

export function PanelShell({ title, description, children, onSignOut }: PanelShellProps) {
  return (
    <Dialog.Content className="fixed right-3 bottom-3 z-50 flex h-[560px] max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[390px] flex-col overflow-hidden rounded-3xl border border-border bg-background text-foreground shadow-[0_24px_100px_-20px_#30204040] outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-4 data-[state=open]:fade-in-0 motion-reduce:animate-none sm:right-8 sm:bottom-8">
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        <Dialog.Title className="flex-1 text-sm font-semibold">{title}</Dialog.Title>
        {onSignOut && (
          <Button variant="ghost" size="icon" aria-label="Sign out" onClick={() => void onSignOut()}>
            <LogOut />
          </Button>
        )}
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close assistant">
            <X />
          </Button>
        </Dialog.Close>
      </header>
      <Dialog.Description className="sr-only">{description}</Dialog.Description>
      {children}
    </Dialog.Content>
  );
}
