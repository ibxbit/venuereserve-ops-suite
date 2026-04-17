#!/usr/bin/env sh
# Strict, deterministic test runner.
#
# Default mode: all tests run inside the Docker Compose backend container so
# they exercise the same Node runtime, the same MySQL service and the same
# environment variables as the production-style stack started by
# `docker-compose up`. This is the only path used in CI.
#
# A host-Node fallback is intentionally NOT enabled here. If you need to run
# tests against a host runtime for ad-hoc debugging, use the explicit
# dev-only helper script `scripts/run-tests-host-dev.sh` instead.
set -eu

log() {
  printf '%s\n' "$1"
}

if ! docker compose version >/dev/null 2>&1; then
  log "Docker Compose is required to run tests but was not found."
  log "Install Docker Desktop / Docker Engine + Compose and re-run \`./run_tests.sh\`."
  log "For ad-hoc local debugging only, the dev-only host runner is available at"
  log "  scripts/run-tests-host-dev.sh"
  log "but it is NOT a substitute for the strict Docker-contained test path."
  exit 1
fi

log "Docker Compose detected. Using backend container (Node 20) for tests."

running_services="$(docker compose ps --services --filter status=running 2>/dev/null || true)"
case " $running_services " in
  *" backend "*)
    log "Compose services already running."
    ;;
  *)
    log "Starting Compose services (detached, build if needed)..."
    docker compose up -d --build
    ;;
esac

if ! docker compose exec -T backend sh -lc "[ -f /app/unit_tests/run-all.unit.test.js ] && [ -f /app/API_tests/run-all.api.test.js ]" >/dev/null 2>&1; then
  log "Backend container is missing root test files. Rebuilding services..."
  docker compose up -d --build
fi

log "Running unit tests from unit_tests/ inside backend container..."
docker compose exec -T backend npm run test --workspace backend -- ../unit_tests/run-all.unit.test.js

log "Running API tests from API_tests/ inside backend container..."
docker compose exec -T backend npm run test --workspace backend -- ../API_tests/run-all.api.test.js

log "Running no-mock API tests from API_tests/no-mock/ inside backend container..."
docker compose exec -T backend npm run test --workspace backend -- ../API_tests/no-mock/

log "All tests completed successfully in backend container."
