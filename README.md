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
npx convex env set VERCEL_TOKEN <vercel-access-token>
npx convex env set VERCEL_TEAM_ID <vercel-team-id>
npx convex env set VERCEL_PROJECT_ID <vercel-project-id>
```

Vercel Sandbox credentials stay on the Convex deployment. They authenticate `@vercel/sandbox` from internal Node actions and are never sent to the browser or into sandbox process env.

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

| State            | UI                                  |
| ---------------- | ----------------------------------- |
| Signed out       | Unlock Patch → Continue with GitHub |
| Authorized owner | Existing agent pane + sign out      |
| Unauthorized     | Access denied + sign out            |

`@patch/react` stays reusable: pass a `PatchAuth` object, or omit `auth` for the open demo panel.

## Using `@patch/react`

```tsx
import { Patch, type PatchAuth } from "@patch/react";

export function Assistant({ auth }: { auth: PatchAuth }) {
  return <Patch auth={auth} />;
}
```

To connect an agent later, pass an async `onPrompt` callback from a client component. Keep API keys on your server.

## Development workspaces

Set `PATCH_REPO_URL` on the Convex deployment to the public HTTPS GitHub repository URL (for example `https://github.com/aymanfouad123/patch.git`). Existing Vercel Sandbox credentials are reused. Deploy the updated Convex functions and push this preview-mode implementation to that repository before starting a workspace: provisioning clones the remote default branch, not local changes.

### Environment preparation

The authenticated Patch pane has an **Environment** section for the single configured repository:

1. Choose **Discover**. Patch reads the public repository's package metadata, lockfile names, safe environment templates (`.env.example`, `.env.sample`, and `.env.template`), framework configuration, and `process.env` references through GitHub. It never requests `.env.local`, `.env.production`, or other secret-bearing environment files.
   Discovery uses the existing server-side `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` for read-only public GitHub API requests. GitHub supports OAuth app client credentials for public data with a separate app quota ([GitHub rate-limit documentation](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-oauth-apps)). Without both credentials, discovery remains anonymous. Errors include the HTTP status, rate-limit reset/retry guidance, and GitHub’s reason; server diagnostics retain the response body and rate-limit headers, with credentials redacted. Credentials never enter the browser, profile, raw file requests, git clone, or Sandbox.
2. Review the detected commands and variable candidates. Discovery does not approve or require a variable. Select only the names the development app needs, then choose **Save**. Discovery creates an unsaved draft; preparation requires a saved profile and the UI disables preparation while edits are unsaved.
3. Leave **Preview mode** enabled when the application can boot without external services. In this mode `PATCH_PREVIEW_MODE=1` is set and approved development variables are neither required nor injected.
4. To test real authentication, create a separate development/test Convex deployment. Put its public URLs on the Patch host Convex deployment:

```sh
npx convex env set PATCH_DEV_NEXT_PUBLIC_CONVEX_URL https://<dev-deployment>.convex.cloud
npx convex env set PATCH_DEV_NEXT_PUBLIC_CONVEX_SITE_URL https://<dev-deployment>.convex.site
```

Select `NEXT_PUBLIC_CONVEX_URL` and `NEXT_PUBLIC_CONVEX_SITE_URL`, disable preview mode, save, and choose **Prepare environment**. Patch validates configured names, clones the current commit, installs dependencies, starts the real app, and performs a bounded HTTP health check. A profile becomes verified only after that check succeeds. Verification records the profile version, commit SHA, and startup duration. A different profile version or repository commit is shown as needing revalidation.

If startup reports a missing variable, Patch records the name as a diagnostic candidate; it never approves the name automatically. A failed attempt keeps the last verified environment profile.

Approved values remain in the existing Convex deployment environment. The database stores only names and `PATCH_DEV_*` mappings, never values. There is no browser endpoint for writing secrets. Patch explicitly blocks its production auth, GitHub, Vercel, owner, and deployment credentials, and never forwards all of `process.env`.

Sandbox creation receives only non-sensitive process-wide configuration. Approved development values are scoped to the detached start command through the Vercel Sandbox command environment API. Clone, package-manager bootstrap, dependency installation, readiness checks, and future coding-agent commands do not receive them by default. Network access is restricted before each phase: GitHub for clone, npm for install, and approved runtime URL hosts for the application. As with any same-user Linux process, repository code could inspect another process through `/proc/<pid>/environ`; use development-only credentials with limited access.

Snapshots are intentionally deferred. Environment Preparation V1 does not write `.env` files, create a secrets vault, import production variables, or run an AI setup agent.

### Starting a workspace

Choose **Start workspace** after preparation. Status advances through cloning, installing, and starting; **Open preview** appears after the configured health path succeeds on the configured port. **Stop workspace** also works during setup. Reloading the pane restores persisted state. Inactive workspaces are labeled **Previous workspace** with expandable historical errors; the **Environment** section reports the current preparation status. The separate **Test sandbox** control still runs `node -v`.

Workspaces expire 15 minutes after sandbox creation, including setup. Setup has a seven-minute command budget and an eight-minute watchdog. Provider expiration and scheduled cleanup bound abandoned environments. Cleanup errors are retained and retried. Sessions are non-persistent (`persistent: false`): stopping creates no snapshot and cannot resume your changes.

In preview mode, sandbox processes receive `PATCH_PREVIEW_MODE=1` and telemetry configuration, never production credentials or Convex URLs. Preview mode bypasses auth/Convex initialization, removes the Patch widget, and returns 404 for auth routes. No GitHub credentials enter Sandbox. Codex execution, snapshots, and PR creation are not used.

For an end-to-end check, start an authenticated workspace, open the preview and confirm the portfolio has no Patch launcher, request `/api/auth/get-session` and confirm 404, reload the host pane, then stop and verify the Vercel session terminated. For expiry verification, temporarily shorten the provider timeout and scheduled expiry together in a test deployment.

### Discovery 403 diagnosis (2026-11-12)

The anonymous request from the Convex server returned HTTP 403 with `x-ratelimit-limit: 60`, `x-ratelimit-used: 60`, `x-ratelimit-remaining: 0`, and `x-ratelimit-reset: 1794536301`. The body reported “API rate limit exceeded for 216.235.222.4.” The identical GET authenticated using the existing OAuth app returned HTTP 200 with a 5,000-request limit and 4,999 remaining. This was the shared server IP's anonymous quota, rather than repository permissions. Local anonymous requests succeeded because they originated from a different IP.

At diagnosis, the profile table was empty and the latest failed workspace had cloned `e345693c4522af6325e6301a3e14c4f836cbbb88`, which initializes Better Auth without the preview bypass. To prepare a live Sandbox successfully, the remote default branch must contain the preview-mode changes in this working tree; deploying Convex alone does not update the application that Sandbox clones.
