#!/usr/bin/env sh
set -eu

if [ ! -d node_modules ]; then
  echo "Installing dependencies (one-time setup)..."
  npm ci
fi

echo "Running unit tests from unit_tests/"
npm run test --workspace backend -- ../unit_tests/run-all.unit.test.js

echo "Running API tests from API_tests/"
npm run test --workspace backend -- ../API_tests/run-all.api.test.js

echo "All tests completed successfully."
