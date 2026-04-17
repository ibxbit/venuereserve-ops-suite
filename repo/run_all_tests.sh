#!/usr/bin/env sh
# Strict, deterministic full-suite runner.
#
# Runs the Docker-contained backend tests via `run_tests.sh` (unit + API +
# no-mock API) and then the frontend test suite via the same container model.
set -eu

log() {
  printf '\n>>> %s\n' "$1"
}

if [ ! -f run_tests.sh ]; then
  log "Error: run_all_tests.sh must be run from the repo directory."
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  log "Docker Compose is required to run the full suite but was not found."
  exit 1
fi

log "Running backend Unit + API + no-mock API tests in Docker container..."
./run_tests.sh

log "Ensuring frontend Compose service is up..."
docker compose up -d --build frontend

log "Running Frontend tests in the frontend container..."
docker compose exec -T frontend npm run test --workspace frontend

log "All verification steps completed!"
