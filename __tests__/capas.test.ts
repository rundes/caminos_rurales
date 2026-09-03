import { describe, expect, test } from 'vitest'
import { capasDe, colorRedProvincial, colorSuperficie } from '@/lib/capas'

describe('capasDe', () => {
  test('devuelve las rutas de capas para maipu', () => {
    expect(capasDe('maipu')).toEqual({
      caminos: '/capas/maipu/caminos.geojson',
      localidades: '/capas/maipu/localidades.geojson',
      limite: '/capas/maipu/limite.geojson',
      redProvincial: '/capas/maipu/red-provincial.geojson',
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

describe('colorRedProvincial', () => {
  test('pavimentado es azul', () => {
    expect(colorRedProvincial('pavimentado')).toBe('#1e40af')
  })

  test('consolidado es violeta', () => {
    expect(colorRedProvincial('consolidado')).toBe('#7c3aed')
  })

  test('tierra es marrón', () => {
    expect(colorRedProvincial('tierra')).toBe('#b45309')
  })

  test('superficie desconocida o nula cae al color de tierra', () => {
    expect(colorRedProvincial(null)).toBe('#b45309')
    expect(colorRedProvincial('otra-cosa')).toBe('#b45309')
  })
})
