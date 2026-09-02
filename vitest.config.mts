import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'components/**', 'app/**/actions.ts'],
      exclude: ['lib/supabase/database.types.ts', 'lib/partidos.ts'],
    },
  },
})
