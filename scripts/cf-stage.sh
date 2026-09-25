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
cp -r .open-next/.build .deploy/.build
cp -r .open-next/server-functions .deploy/server-functions
for d in middleware cloudflare dynamodb-provider cache; do
  [ -d ".open-next/$d" ] && cp -r ".open-next/$d" ".deploy/$d"
done
cp -r .open-next/assets/. .deploy/
echo "[cf-stage] staged $(find .deploy -type f | wc -l | tr -d ' ') files in .deploy/"
