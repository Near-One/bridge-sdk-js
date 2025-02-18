import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    testTimeout: 60_000,
    hookTimeout: 60_000,
    deps: {
      inline: [
        /@near-js\/.*/, // This will match all @near-js packages
      ],
    },
  },
})
