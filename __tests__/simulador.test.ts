import { describe, expect, test } from 'vitest'
import { generarFallasSimuladas } from '@/lib/simulador'
import { distanciaKm } from '@/lib/geo'

describe('generarFallasSimuladas', () => {
  const centro = { lat: -35.5, lng: -60.2 }

  test('genera entre 2 y 6 fallas dentro de 15 km', () => {
    for (let i = 0; i < 50; i++) {
      const fallas = generarFallasSimuladas(centro, Math.random)
      expect(fallas.length).toBeGreaterThanOrEqual(2)
      expect(fallas.length).toBeLessThanOrEqual(6)
      for (const f of fallas) {
        expect(distanciaKm(centro, { lat: f.latitud, lng: f.longitud })).toBeLessThanOrEqual(15.01)
        expect(['baja', 'media', 'alta']).toContain(f.severidad)
      }
    }
  })

  test('es determinista con generador fijo', () => {
    const a = generarFallasSimuladas(centro, () => 0.3)
    const b = generarFallasSimuladas(centro, () => 0.3)
    expect(a).toEqual(b)
  })
})
