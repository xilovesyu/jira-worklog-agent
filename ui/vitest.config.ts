/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom for DOM simulation
    environment: 'jsdom',

    // Global test APIs
    globals: true,

    // Setup files
    setupFiles: ['./src/tests/setup.ts'],

    // Test file patterns
    include: ['src/**/*.test.{ts,tsx}'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      include: ['src/components/**', 'src/lib/**', 'src/utils/**'],
      exclude: ['src/tests/**', 'src/types/**']
    }
  }
})