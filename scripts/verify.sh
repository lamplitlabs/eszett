#!/bin/sh
# Typecheck, run the tests, and check the translation catalogs. Used by the
# scheduled check (SCHED-016) and by hand: `sh scripts/verify.sh`. The app
# and server are two packages, so both get their locked dependencies and
# both run their own checks.
set -e
cd "$(dirname "$0")/.."

# The scheduled runner may start from a fresh checkout without node_modules,
# which surfaces as `sh: tsc: command not found` (exit 127). Install the
# locked dependencies in that case instead of failing on a missing binary.
if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/vitest ]; then
  echo "verify: node_modules/.bin/tsc or vitest missing; running npm ci" >&2
  npm ci
fi
if [ ! -x server/node_modules/.bin/tsc ] || [ ! -x server/node_modules/.bin/vitest ]; then
  echo "verify: server/node_modules/.bin/tsc or vitest missing; running npm ci in server" >&2
  npm ci --prefix server
fi

npm run typecheck
npm test
npm run typecheck --prefix server
npm test --prefix server
npm run i18n-check
