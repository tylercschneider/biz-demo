import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/e2e-ui-db/**'],
    environment: 'node',
    hookTimeout: 20_000,
    testTimeout: 20_000
  }
})
