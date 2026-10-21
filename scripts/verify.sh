#!/bin/sh
# Typecheck, run the tests, and check the translation catalogs. Used by the
# scheduled check (SCHED-016) and by hand: `sh scripts/verify.sh`.
set -e
cd "$(dirname "$0")/.."

# The scheduled runner may start from a fresh checkout without node_modules,
# which surfaces as `sh: tsc: command not found` (exit 127). Install the
# locked dependencies in that case instead of failing on a missing binary.
if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/vitest ]; then
  echo "verify: node_modules/.bin/tsc or vitest missing; running npm ci" >&2
  npm ci
fi

npm run typecheck
npm test
npm run i18n-check
