#!/bin/sh
# Dependency audit: exits non-zero when npm audit finds a high or critical vulnerability.
set -e
cd "$(dirname "$0")/.."
npm audit --audit-level=high
