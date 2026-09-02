import { describe, expect, test } from 'vitest'
import { formatearFecha } from '@/lib/fechas'

describe('formatearFecha', () => {
  test('convierte a la zona horaria de Argentina (UTC-3)', () => {
    expect(formatearFecha('2026-01-01T23:30:00Z')).toBe('1/1/2026')
  })

  test('un horario después de medianoche UTC sigue siendo el día anterior en ART', () => {
    expect(formatearFecha('2026-01-02T02:30:00Z')).toBe('1/1/2026')
  })
})
