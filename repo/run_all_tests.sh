#!/usr/bin/env sh
# Automated script to run all backend and frontend tests for TASK-46
set -eu

log() {
  printf '\n>>> %s\n' "$1"
}

# Ensure we are in the repo directory
if [ ! -f run_tests.sh ]; then
  log "Error: run_all_tests.sh must be run from the repo directory."
  exit 1
fi

# 1. Run standard backend tests (Unit + API) via existing runner
log "Running standard Backend Unit and API tests..."
./run_tests.sh

# 2. Run new security verification tests
log "Running new Audit Security Verification tests..."
if docker compose version >/dev/null 2>&1 && docker compose ps --services --filter status=running | grep -q backend; then
  docker compose exec -T backend npm run test --workspace backend -- tests/integration/audit-fix-verification.test.js
else
  # Fallback to local if node 20+
  if command -v node >/dev/null 2>&1 && [ "$(node -p "process.versions.node.split('.')[0]")" -ge 20 ]; then
    npm run test --workspace backend -- tests/integration/audit-fix-verification.test.js
  else
    log "Skipping new security tests: Docker not running and local Node < 20."
  fi
fi

# 3. Run Frontend tests
log "Running Frontend tests..."
cd frontend && npm run test && cd ..

log "All verification steps completed!"
