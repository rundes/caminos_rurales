import { describe, expect, test } from 'vitest'
import { finDeDia, formatearFecha, formatearFechaHora, formatearHora } from '@/lib/fechas'

describe('formatearFecha', () => {
  test('convierte a la zona horaria de Argentina (UTC-3)', () => {
    expect(formatearFecha('2026-01-01T23:30:00Z')).toBe('1/1/2026')
  })

  test('un horario después de medianoche UTC sigue siendo el día anterior en ART', () => {
    expect(formatearFecha('2026-01-02T02:30:00Z')).toBe('1/1/2026')
  })
})

describe('formatearHora', () => {
  test('convierte a la zona horaria de Argentina (UTC-3), hora y minuto', () => {
    expect(formatearHora('2026-01-01T23:30:00Z')).toBe('08:30 p. m.')
  })

  test('un horario después de medianoche UTC sigue siendo el día anterior en ART', () => {
    expect(formatearHora('2026-01-02T02:15:00Z')).toBe('11:15 p. m.')
  })
})

describe('formatearFechaHora', () => {
  test('incluye fecha y hora en la zona horaria de Argentina', () => {
    const resultado = formatearFechaHora('2026-01-01T23:30:00Z')
    expect(resultado).toContain('1/1/2026')
    expect(resultado).toContain('08:30:00')
  })
})

describe('finDeDia', () => {
  test('agrega el último instante del día a una fecha aaaa-mm-dd', () => {
    expect(finDeDia('2026-01-05')).toBe('2026-01-05T23:59:59.999')
  })
})
