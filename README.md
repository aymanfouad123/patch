# Patch

An embeddable React widget that lets a website owner modify their deployed site through remote coding agents. This repo is a pnpm workspace with a Next.js demo site and the reusable `@patch/react` package.

## Run locally

Requires Node.js 20.9+ and pnpm 12.8.1.

```sh
pnpm install
pnpm convex:dev
pnpm dev
```

Open http://localhost:3000. Click the violet blob to open Patch. Escape closes the panel, Enter sends a prompt, and Shift + Enter adds a new line.

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

## Workspace

- `apps/web` — Next.js App Router demo portfolio, Convex Better Auth client wiring, and the Patch widget host.
- `packages/react` — `@patch/react`, containing Patch, AgentPanel, and shared shadcn/ui primitives. Auth is injected through a typed `auth` prop; the package does not import Better Auth or Convex.
- `convex/` — Convex backend with the Better Auth component, owner-only GitHub gate, and protected `patch.getSession` / `patch.getViewer` queries.

The app imports the package source through `workspace:*` and Next.js `transpilePackages`. Tailwind scans the package through the app stylesheet’s `@source` directive.

## Owner-only GitHub authentication

Patch is locked to a single owner GitHub account. Users, linked accounts, and sessions live in the Convex Better Auth component storage. There is no PostgreSQL, no email/password auth, and no public signup.

### Owner bootstrap

1. From the repo root, run `pnpm convex:dev` (or `npx convex deployment create …`) so Convex writes `CONVEX_DEPLOYMENT`, `CONVEX_URL`, and `CONVEX_SITE_URL` to `.env.local`.
2. Create a GitHub OAuth App:
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. Look up your numeric GitHub user id:

```sh
curl -s https://api.github.com/users/<your-login> | jq .id
```

4. Set **server-only** environment variables on the Convex deployment. These never go into Next.js public env or the browser:

```sh
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
npx convex env set GITHUB_CLIENT_ID <github-oauth-client-id>
npx convex env set GITHUB_CLIENT_SECRET <github-oauth-client-secret>
npx convex env set PATCH_OWNER_GITHUB_ID <numeric-github-id>
```

5. Create `apps/web/.env.local` with the public Convex URLs (values come from the root `.env.local`):

```sh
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://<deployment>.convex.site
```

6. Run `pnpm dev`, open Patch, and choose **Continue with GitHub** while signed into the owner GitHub account. That first successful OAuth creates the only user.
7. After bootstrap, every later user creation is rejected. Non-owner GitHub accounts are rejected before records are written (`user.validateUserInfo` plus database hooks). Protected Convex functions also require the owner’s linked GitHub `accountId`.

### Rotating the owner

1. Update `PATCH_OWNER_GITHUB_ID` with `npx convex env set`.
2. In the Convex dashboard, delete the previous Better Auth user (and related account/session rows) from the Better Auth component data.
3. Sign in once with the new owner account to bootstrap again.

### Auth UX in the widget

| State | UI |
| --- | --- |
| Signed out | Unlock Patch → Continue with GitHub |
| Authorized owner | Existing agent pane + sign out |
| Unauthorized | Access denied + sign out |

`@patch/react` stays reusable: pass a `PatchAuth` object, or omit `auth` for the open demo panel.

## Using `@patch/react`

```tsx
import { Patch, type PatchAuth } from "@patch/react";

export function Assistant({ auth }: { auth: PatchAuth }) {
  return <Patch auth={auth} />;
}
```

To connect an agent later, pass an async `onPrompt` callback from a client component. Keep API keys on your server.
