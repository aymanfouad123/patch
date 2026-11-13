# Patch

An embeddable React widget that lets a website owner modify their deployed site through remote coding agents. This repo is a pnpm workspace with a Next.js demo site, a long-lived run server, and the reusable `@patch/react` package.

## Run locally

Requires Node.js 20.9+ and pnpm 12.8.1.

```sh
pnpm install
pnpm convex:dev
pnpm dev
pnpm dev:server
```

Open http://localhost:3000. Click the violet blob to open Patch. Escape closes the panel, Enter sends a prompt, and Shift + Enter adds a new line.

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm start
```

## Workspace

- `apps/web` — Next.js App Router demo portfolio, Convex Better Auth client wiring, and the Patch widget host. Login and `/api/auth` stay here. There is no run API on Next.js.
- `apps/server` — One Node 24 + TypeScript process (Hono). Serves `POST /runs`, `GET /runs/:id`, and `POST /runs/:id/cancel`, and runs the claim loop that provisions and cleans up Vercel sandboxes.
- `packages/react` — `@patch/react`, containing Patch, AgentPanel, and shared UI. Auth and run state are injected through props.
- `packages/environment` — Pure helpers for discovery, approved-env resolution, and redaction.
- `convex/` — Better Auth, owner authorization, environment profiles, and durable run state with claim-fenced transitions. Convex does not call Vercel.
- `fixtures/next-minimal` — Reference Next.js fixture for `environment_test` runs.

## Owner-only GitHub authentication

Patch is locked to a single owner GitHub account. Users, linked accounts, and sessions live in the Convex Better Auth component storage. There is no PostgreSQL, no email/password auth, and no public signup.

### Owner bootstrap

1. From the repo root, run `pnpm convex:dev` so Convex writes `CONVEX_DEPLOYMENT`, `CONVEX_URL`, and `CONVEX_SITE_URL` to `.env.local`.
2. Create a GitHub OAuth App:
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
3. Look up your numeric GitHub user id:

```sh
curl -s https://api.github.com/users/<your-login> | jq .id
```

4. Set **server-only** environment variables on the Convex deployment:

```sh
npx convex env set BETTER_AUTH_SECRET "$(openssl rand -base64 32)"
npx convex env set SITE_URL http://localhost:3000
npx convex env set GITHUB_CLIENT_ID <github-oauth-client-id>
npx convex env set GITHUB_CLIENT_SECRET <github-oauth-client-secret>
npx convex env set PATCH_OWNER_GITHUB_ID <numeric-github-id>
npx convex env set PATCH_RUNNER_SECRET "$(openssl rand -base64 32)"
```

5. Create `apps/web/.env.local` with the public Convex URLs and the run server origin:

```sh
NEXT_PUBLIC_CONVEX_URL=https://<deployment>.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://<deployment>.convex.site
NEXT_PUBLIC_PATCH_SERVER_URL=http://localhost:8787
```

6. Create `apps/server/.env.local` (or export) with:

```sh
CONVEX_URL=https://<deployment>.convex.cloud
CONVEX_SITE_URL=https://<deployment>.convex.site
PATCH_RUNNER_SECRET=<same as Convex>
VERCEL_TOKEN=<vercel-access-token>
VERCEL_TEAM_ID=<vercel-team-id>
VERCEL_PROJECT_ID=<vercel-project-id>
PORT=8787
PATCH_WEB_ORIGIN=http://localhost:3000
```

Vercel Sandbox credentials live only on `apps/server`. They never go to the browser or into Convex.

7. Run `pnpm convex:dev`, `pnpm dev`, and `pnpm dev:server`. Open Patch and choose **Continue with GitHub** while signed into the owner GitHub account.

### Auth UX in the widget

| State            | UI                                  |
| ---------------- | ----------------------------------- |
| Signed out       | Unlock Patch → Continue with GitHub |
| Authorized owner | Agent pane + environment + sign out |
| Unauthorized     | Access denied + sign out            |

## Environment test runs

1. Publish `fixtures/next-minimal` (or another small public app) and pin a commit SHA.
2. Seed the profile (CLI only):

```sh
npx convex run environment:seedProfile '{
  "repoUrl": "https://github.com/<owner>/<fixture>.git",
  "commitSha": "<full-sha>",
  "installCommand": "pnpm install --frozen-lockfile",
  "startCommand": "pnpm dev --hostname 0.0.0.0 --port 3000",
  "port": 3000,
  "healthPath": "/",
  "previewMode": true,
  "workingDirectory": "."
}'
```

3. From the authenticated widget, choose **Prepare environment**, or call the API with the owner JWT from `authClient.convex.token()`:

```sh
curl -X POST http://localhost:8787/runs \
  -H "authorization: Bearer <jwt>" \
  -H "content-type: application/json" \
  -d '{"kind":"environment_test"}'
```

4. Trace a run by ID:

- `GET http://localhost:8787/runs/<runId>`
- The `runs` row in the Convex dashboard
- Server logs keyed by `runId`
- The Vercel sandbox named `patch-run-<runId>`

5. Optional live script (requires `PATCH_OWNER_JWT`):

```sh
PATCH_OWNER_JWT=... ./scripts/prove-environment-test.sh
```

Preview URLs from Vercel Sandbox are treated as public unless access protection is verified. The fixture holds no secrets.

### Failure behavior

- Failed boots record `failedStage` and redacted diagnostics, then clean up. Setup is never resumed mid-way.
- Cancel during create sets `cancelRequested`; the claim holder stops the sandbox when create returns.
- Server restart: leases expire (~30s), `sweep` moves the run to `cleanup_pending`, and the next claim stops `patch-run-<runId>` by name.
- Provider timeout is the hard upper bound if the runner never returns.

## Using `@patch/react`

```tsx
import { Patch, type PatchAuth } from "@patch/react";

export function Assistant({ auth }: { auth: PatchAuth }) {
  return <Patch auth={auth} />;
}
```

To connect an agent later, pass an async `onPrompt` callback from a client component. Keep API keys on your server.

## Deferred

Agents, PR creation, snapshots, secret upload UI, parallel runs, widget redesign, and element selection are deferred until the fixture and one real app both boot reliably through this runner.
