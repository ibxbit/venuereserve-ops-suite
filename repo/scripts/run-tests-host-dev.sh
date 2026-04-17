#!/usr/bin/env sh
# DEV-ONLY host-Node test runner.
#
# This script intentionally lives outside the strict default test path
# (`run_tests.sh`). It is for ad-hoc local debugging only — CI must always
# use the Docker-contained `run_tests.sh` for deterministic environment.
#
# Requirements: Node.js 20+ on PATH and `npm ci` already run in the repo.
set -eu

log() {
  printf '%s\n' "$1"
}

if ! command -v node >/dev/null 2>&1; then
  log "Node.js is required for the host-dev runner but was not found."
  exit 1
fi

major="$(node -p "process.versions.node.split('.')[0]")"
if [ "$major" -lt 20 ]; then
  log "Host Node.js is v$(node -v | tr -d 'v'); v20+ is required for the host-dev runner."
  exit 1
fi

if [ ! -d node_modules ]; then
  log "Installing dependencies for host-dev execution..."
  npm ci
fi

log "Running unit tests from unit_tests/ on host Node $(node -v)..."
npm run test --workspace backend -- ../unit_tests/run-all.unit.test.js

log "Running API tests from API_tests/ on host Node $(node -v)..."
npm run test --workspace backend -- ../API_tests/run-all.api.test.js

log "Running no-mock API tests from API_tests/no-mock/ on host Node $(node -v)..."
npm run test --workspace backend -- ../API_tests/no-mock/

log "All host-dev tests completed."
