import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Global test APIs (describe, it, expect, etc.)
    globals: true,

    // Node environment for backend tests
    environment: 'node',

    // Test file patterns
    include: [
      'tests/unit/**/*.test.mjs',
      'tests/integration/**/*.test.mjs'
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      'ui'
    ],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/**/*.mjs'],
      exclude: [
        'src/wasmEmbed.mjs',  // Large binary file, not testable
        'src/index.mjs'       // Entry point, tested via integration
      ]
    },

    // Setup files
    setupFiles: ['./tests/setup.mjs'],

    // Test timeout
    testTimeout: 10000
  }
})