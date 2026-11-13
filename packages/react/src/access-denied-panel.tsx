"use client";

import { Button } from "./components/ui/button";
import { PanelShell } from "./panel-shell";

export type AccessDeniedPanelProps = {
  onSignOut: () => void | Promise<void>;
};

export function AccessDeniedPanel({ onSignOut }: AccessDeniedPanelProps) {
  return (
    <PanelShell
      title="Access denied"
      description="This GitHub account is not authorized to use Patch."
      onSignOut={onSignOut}
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
        <p className="max-w-[280px] text-sm leading-6 text-muted-foreground">
          Only the site owner can use Patch. Sign out and try again with the owner account.
        </p>
        <Button type="button" variant="outline" onClick={() => void onSignOut()}>
          Sign out
        </Button>
      </div>
    </PanelShell>
  );
}
