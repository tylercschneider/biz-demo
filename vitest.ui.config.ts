import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/e2e-ui-db/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 60_000
  }
})
