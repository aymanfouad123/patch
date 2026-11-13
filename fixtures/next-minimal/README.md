# Patch fixture

Minimal Next.js app used as the `environment_test` target.

Publish this directory as a public GitHub repository (for example
`aymanfouad123/patch-fixture-next`), commit a `pnpm-lock.yaml`, and pin that
commit SHA when seeding the environment profile:

```sh
npx convex run environment:seedProfile '{
  "repoUrl": "https://github.com/<owner>/patch-fixture-next.git",
  "commitSha": "<full-sha>",
  "installCommand": "pnpm install --frozen-lockfile",
  "startCommand": "pnpm dev --hostname 0.0.0.0 --port 3000",
  "port": 3000,
  "healthPath": "/",
  "previewMode": true,
  "workingDirectory": "."
}'
```
