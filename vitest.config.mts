import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['__tests__/**/*.test.{ts,tsx}'],
    // Con cobertura (instrumentación v8) y los ~70 archivos de test corriendo
    // en paralelo, algún caso de rendimiento intensivo (p. ej. Douglas-Peucker
    // sobre miles de puntos en __tests__/track.test.ts) puede superar el
    // default de 5 s por contención de CPU, no por una regresión real.
    testTimeout: 20_000,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'components/**', 'hooks/**', 'app/**/actions.ts', 'app/**/route.ts'],
      exclude: [
        'lib/supabase/database.types.ts',
        'lib/partidos.ts',
        'lib/supabase/server.ts',
        'lib/supabase/client.ts',
        'lib/supabase/admin.ts',
      ],
      // Piso ~5 puntos por debajo de lo medido el 2026-09-07 (statements
      // 83.72 %, branches 76.63 %, functions 81.43 %, lines 85.91 %): que CI
      // corte una regresión real sin ser tan ajustado que la más mínima
      // fluctuación entre entornos lo haga fallar.
      thresholds: {
        statements: 78,
        branches: 71,
        functions: 76,
        lines: 80,
      },
    },
  },
})
