#!/usr/bin/env bash
# Stage the Cloudflare Pages deploy directory.
#
# OpenNext emits .open-next/worker.js (entry) plus sibling module dirs
# (.build/, server-functions/, middleware/, cloudflare/, cache/). Pages needs
# the worker as _worker.js at the root of the upload dir together with those
# siblings AND the static assets (contents of .open-next/assets/).
set -euo pipefail
cd "$(dirname "$0")/.."

rm -rf .deploy
mkdir -p .deploy
cp .open-next/worker.js .deploy/_worker.js
# On Cloudflare Pages the worker intercepts every request, so opt into
# worker-first asset serving: static files are then resolved through the
# Pages ASSETS binding (see OpenNext maybeGetAssetResult).
printf 'globalThis.__ASSETS_RUN_WORKER_FIRST__ = true;\n' | cat - .open-next/worker.js > .deploy/_worker.js
cp -r .open-next/.build .deploy/.build
cp -r .open-next/server-functions .deploy/server-functions
for d in middleware cloudflare dynamodb-provider cache; do
  [ -d ".open-next/$d" ] && cp -r ".open-next/$d" ".deploy/$d"
done
cp -r .open-next/assets/. .deploy/
# Pages advanced mode: the worker intercepts every request, so static assets
# must be explicitly excluded from the worker via _routes.json.
cat > .deploy/_routes.json << 'ROUTES'
{
  "version": 1,
  "include": ["/*"],
  "exclude": ["/_next/static/*", "/*.png", "/*.ico", "/*.jpg", "/*.jpeg", "/*.svg", "/*.webp", "/BUILD_ID", "/favicon.ico"]
}
ROUTES

# public/ assets (logo etc.) must sit at the deploy root
if [ -d public ]; then cp -r public/. .deploy/; fi
echo "[cf-stage] staged $(find .deploy -type f | wc -l | tr -d ' ') files in .deploy/"