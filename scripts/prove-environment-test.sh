#!/usr/bin/env bash
# Live proof for one environment_test run against a published fixture repo.
# Prerequisites: pnpm convex:dev, pnpm dev, pnpm dev:server, owner JWT, Vercel creds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_URL="${PATCH_SERVER_URL:-http://localhost:8787}"
JWT="${PATCH_OWNER_JWT:?Set PATCH_OWNER_JWT to the owner Convex JWT from authClient.convex.token()}"

echo "== health =="
curl -fsS "$SERVER_URL/healthz"
echo

echo "== enqueue =="
RUN_JSON="$(curl -fsS -X POST "$SERVER_URL/runs" \
  -H "authorization: Bearer $JWT" \
  -H "content-type: application/json" \
  -d '{"kind":"environment_test"}')"
echo "$RUN_JSON"
RUN_ID="$(node -e "const j=JSON.parse(process.argv[1]); if(!j.runId) process.exit(1); process.stdout.write(j.runId)" "$RUN_JSON")"

echo "== poll $RUN_ID =="
for _ in $(seq 1 180); do
  VIEW="$(curl -fsS "$SERVER_URL/runs/$RUN_ID" -H "authorization: Bearer $JWT")"
  STATUS="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).status||'')" "$VIEW")"
  STAGE="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).stage||'')" "$VIEW")"
  echo "status=$STATUS stage=$STAGE"
  case "$STATUS" in
    ready)
      PREVIEW="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).previewUrl||'')" "$VIEW")"
      echo "preview=$PREVIEW"
      curl -fsS -o /dev/null -w "preview_http=%{http_code}\n" "$PREVIEW"
      echo "== cancel =="
      curl -fsS -X POST "$SERVER_URL/runs/$RUN_ID/cancel" -H "authorization: Bearer $JWT"
      echo
      exit 0
      ;;
    failed|cancelled|expired|succeeded)
      echo "$VIEW"
      exit 1
      ;;
  esac
  sleep 2
done

echo "timed out waiting for ready"
exit 1
