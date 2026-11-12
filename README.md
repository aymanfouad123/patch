# Patch

A minimal pnpm workspace with a Next.js 16 portfolio demo and a reusable React assistant interface.

## Run locally

Requires Node.js 20.9+ and pnpm 12.8.1.

```sh
pnpm install
pnpm dev
```

Open http://localhost:3000. Click the violet blob to open Patch. Escape closes the panel, Enter sends a prompt, and Shift + Enter adds a new line.

```sh
pnpm typecheck
pnpm build
pnpm start
```

## Workspace

- `apps/web` — Next.js App Router, TypeScript, Tailwind CSS v4, and the portfolio demo.
- `packages/react` — `@patch/react`, containing Patch, AgentPanel, and shared shadcn/ui primitives.

The app imports the package source directly through `workspace:*` and Next.js `transpilePackages`. No separate package build is required. Tailwind scans the package through the app stylesheet’s `@source` directive.

```tsx
import { Patch } from "@patch/react";

export default function Page() {
  return <Patch />;
}
```

`Patch` is a client component. To connect an agent, pass an async `onPrompt` callback from a client component. Return a string to display a reply. Keep API keys on your server and call your own endpoint from this callback.

```tsx
"use client";

import { Patch } from "@patch/react";

export function Assistant() {
  return <Patch onPrompt={async (prompt) => {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!response.ok) throw new Error("Agent request failed");
    const data: { reply: string } = await response.json();
    return data.reply;
  }} />;
}
```

The starter has no agent endpoint. Without `onPrompt`, it displays a local demo response; messages remain in memory while the panel is open. The interface uses Radix Dialog for focus trapping, Escape handling, and focus restoration. Both workspaces include `components.json` for adding shadcn/ui components. Consumers must include the shared source in Tailwind scanning and supply the theme variables shown in `apps/web/app/globals.css`.
