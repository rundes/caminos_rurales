import { describe, expect, test } from 'vitest'
import { distanciaKm, puntoAleatorioEnRadio } from '@/lib/geo'

describe('distanciaKm', () => {
  test('distancia entre el mismo punto es 0', () => {
    expect(distanciaKm({ lat: -35, lng: -60 }, { lat: -35, lng: -60 })).toBe(0)
  })

  test('un grado de latitud son ~111 km', () => {
    const d = distanciaKm({ lat: -35, lng: -60 }, { lat: -36, lng: -60 })
    expect(d).toBeGreaterThan(110)
    expect(d).toBeLessThan(112)
  })
})

describe('puntoAleatorioEnRadio', () => {
  test('genera puntos dentro del radio', () => {
    const centro = { lat: -35.5, lng: -60.2 }
    for (let i = 0; i < 200; i++) {
      const p = puntoAleatorioEnRadio(centro, 15, Math.random)
      expect(distanciaKm(centro, p)).toBeLessThanOrEqual(15.01)
    }
  })

  test('es determinista con un generador fijo', () => {
    const centro = { lat: -35.5, lng: -60.2 }
    const a = puntoAleatorioEnRadio(centro, 10, () => 0.5)
    const b = puntoAleatorioEnRadio(centro, 10, () => 0.5)
    expect(a).toEqual(b)
  })
})
