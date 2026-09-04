import { describe, expect, test } from 'vitest'
import { crearDetectorImpactos } from '@/lib/sensores/impactos'

const T0 = 1_700_000_000_000
const GPS = { lat: -36.85, lng: -57.88, velocidadKmh: 42 }

describe('crearDetectorImpactos', () => {
  test('solo dispara por encima del umbral', () => {
    const detector = crearDetectorImpactos()

    expect(detector.evaluar(5.9, T0, GPS)).toBeNull()
    expect(detector.evaluar(6, T0, GPS)).toBeNull() // el umbral es estricto
    expect(detector.evaluar(6.1, T0, GPS)).not.toBeNull()
  })

  test('devuelve el impacto con posición, pico y velocidad', () => {
    const detector = crearDetectorImpactos()

    expect(detector.evaluar(8.5, T0, GPS)).toEqual({
      t: T0,
      lat: GPS.lat,
      lng: GPS.lng,
      pico: 8.5,
      velocidadKmh: GPS.velocidadKmh,
    })
  })

  test('un pico hacia arriba cuenta igual que uno hacia abajo', () => {
    const detector = crearDetectorImpactos()

    expect(detector.evaluar(-9, T0, GPS)?.pico).toBe(9)
  })

  test('ignora los rebotes dentro de la ventana muerta', () => {
    const detector = crearDetectorImpactos()

    expect(detector.evaluar(9, T0, GPS)).not.toBeNull()
    expect(detector.evaluar(12, T0 + 500, GPS)).toBeNull()
    expect(detector.evaluar(12, T0 + 1499, GPS)).toBeNull()
    expect(detector.evaluar(12, T0 + 1500, GPS)).not.toBeNull()
  })

  test('sin posición descarta el impacto sin consumir la ventana muerta', () => {
    const detector = crearDetectorImpactos()

    expect(detector.evaluar(9, T0, null)).toBeNull()
    // El próximo pico sí tiene dónde ubicarse: no lo bloquea el debounce.
    expect(detector.evaluar(9, T0 + 10, GPS)).not.toBeNull()
  })

  test('acepta umbral y debounce propios', () => {
    const detector = crearDetectorImpactos(3, 100)

    expect(detector.evaluar(4, T0, GPS)).not.toBeNull()
    expect(detector.evaluar(4, T0 + 99, GPS)).toBeNull()
    expect(detector.evaluar(4, T0 + 100, GPS)).not.toBeNull()
  })

  test('una lectura no numérica no dispara nada', () => {
    const detector = crearDetectorImpactos()

    expect(detector.evaluar(Number.NaN, T0, GPS)).toBeNull()
  })
})
