import { describe, expect, test } from 'vitest'
import { capasDe, colorSuperficie } from '@/lib/capas'

describe('capasDe', () => {
  test('devuelve las rutas de capas para maipu', () => {
    expect(capasDe('maipu')).toEqual({
      caminos: '/capas/maipu/caminos.geojson',
      localidades: '/capas/maipu/localidades.geojson',
    })
  })

  test('devuelve null para un municipio sin capas registradas', () => {
    expect(capasDe('otro')).toBeNull()
  })

  test('devuelve null para municipio vacío o indefinido', () => {
    expect(capasDe(null)).toBeNull()
    expect(capasDe(undefined)).toBeNull()
    expect(capasDe('')).toBeNull()
  })
})

describe('colorSuperficie', () => {
  test('unpaved es marrón', () => {
    expect(colorSuperficie('unpaved')).toBe('#8d6e63')
  })

  test('paved, asphalt y concrete son gris azulado', () => {
    expect(colorSuperficie('paved')).toBe('#546e7a')
    expect(colorSuperficie('asphalt')).toBe('#546e7a')
    expect(colorSuperficie('concrete')).toBe('#546e7a')
  })

  test('superficie desconocida o nula usa el color neutro', () => {
    expect(colorSuperficie(null)).toBe('#a1887f')
    expect(colorSuperficie('otra-cosa')).toBe('#a1887f')
  })
})
