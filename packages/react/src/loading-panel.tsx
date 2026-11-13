"use client";

import { PanelShell } from "./panel-shell";

export function LoadingPanel() {
  return (
    <PanelShell title="Patch" description="Checking Patch authorization.">
      <div className="flex min-h-0 flex-1 items-center justify-center px-8">
        <p role="status" className="text-sm text-muted-foreground">
          Checking access…
        </p>
      </div>
    </PanelShell>
  );
}
