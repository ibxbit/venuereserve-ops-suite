import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/**/*.test.js",
      "../unit_tests/**/*.test.js",
      "../API_tests/**/*.test.js",
    ],
    clearMocks: true,
    restoreMocks: true,
    fileParallelism: false,
    testTimeout: 10000,
  },
});
