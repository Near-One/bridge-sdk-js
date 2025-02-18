import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@near-js/client": require.resolve("@near-js/client"), // Fixes ESM import issues
    },
  },
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
