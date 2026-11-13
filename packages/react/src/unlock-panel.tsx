"use client";

import { Button } from "./components/ui/button";
import { PanelShell } from "./panel-shell";

export type UnlockPanelProps = {
  onSignIn: () => void | Promise<void>;
};

export function UnlockPanel({ onSignIn }: UnlockPanelProps) {
  return (
    <PanelShell title="Unlock Patch" description="Sign in with GitHub to unlock Patch.">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        <p className="max-w-[260px] text-sm leading-6 text-muted-foreground">
          Continue with GitHub to unlock the Patch assistant for this site.
        </p>
        <Button
          type="button"
          onClick={() => void onSignIn()}
          className="bg-[#7961aa] hover:bg-[#654c96]"
        >
          Continue with GitHub
        </Button>
      </div>
    </PanelShell>
  );
}
