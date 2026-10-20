import { defineConfig } from 'vitest/config'

export default defineConfig({
  // JSX は tsconfig の jsx: react-jsx に従って変換される
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
