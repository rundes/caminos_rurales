import { describe, expect, test } from 'vitest'
import { colorCalidad, ETIQUETA_CALIDAD } from '@/lib/sensores/colores'

describe('colorCalidad', () => {
  test('devuelve el color correspondiente a cada calidad', () => {
    expect(colorCalidad('bueno')).toBe('#16a34a')
    expect(colorCalidad('regular')).toBe('#eab308')
    expect(colorCalidad('malo')).toBe('#f97316')
    expect(colorCalidad('intransitable')).toBe('#dc2626')
    expect(colorCalidad('sin_dato')).toBe('#9ca3af')
  })
})

describe('ETIQUETA_CALIDAD', () => {
  test('tiene una etiqueta legible para cada calidad', () => {
    expect(ETIQUETA_CALIDAD).toEqual({
      bueno: 'Bueno',
      regular: 'Regular',
      malo: 'Malo',
      intransitable: 'Intransitable',
      sin_dato: 'Sin datos',
    })
  })
})
