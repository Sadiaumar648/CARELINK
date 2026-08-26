/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/load-env.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Integration tests hit the real Supabase project over the network —
  // multi-step flows (request -> accept -> pay -> start -> end) can
  // involve a dozen round trips.
  testTimeout: 60000,
};
