#!/usr/bin/env sh
set -eu

log() {
  printf '%s\n' "$1"
}

require_node20_or_fail() {
  if ! command -v node >/dev/null 2>&1; then
    log "Node.js is required for fallback execution but was not found."
    exit 1
  fi

  major="$(node -p "process.versions.node.split('.')[0]")"
  if [ "$major" -lt 20 ]; then
    log "Containerized test execution is unavailable and host Node.js is v$(node -v | tr -d 'v')."
    log "Node.js 20+ is required to run this project's tests (router and vitest rely on newer runtime APIs)."
    exit 1
  fi
}

run_host_tests() {
  require_node20_or_fail
  if [ ! -d node_modules ]; then
    log "Installing dependencies for fallback host execution..."
    npm ci
  fi

  log "Running unit tests from unit_tests/ on host Node $(node -v)..."
  npm run test --workspace backend -- ../unit_tests/run-all.unit.test.js

  log "Running API tests from API_tests/ on host Node $(node -v)..."
  npm run test --workspace backend -- ../API_tests/run-all.api.test.js
}

if docker compose version >/dev/null 2>&1; then
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

  log "All tests completed successfully in backend container."
else
  log "Docker Compose is unavailable. Falling back to host execution."
  run_host_tests
  log "All tests completed successfully on host."
fi
