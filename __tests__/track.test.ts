import { describe, expect, test } from 'vitest'
import { filtrarPunto, kmDeTrack, simplificar, type PuntoGps } from '@/lib/track'

const KM_POR_GRADO = (Math.PI / 180) * 6371
const LAT_BASE = -36.88

function offsetLatKm(km: number): number {
  return km / KM_POR_GRADO
}

function offsetLngKm(km: number, latGrados: number): number {
  return km / (KM_POR_GRADO * Math.cos((latGrados * Math.PI) / 180))
}

function punto(lat: number, lng: number, t = 0, precision = 5): PuntoGps {
  return { lat, lng, t, precision }
}

describe('filtrarPunto', () => {
  test('acepta el primer punto (sin último) si la precisión es buena', () => {
    expect(filtrarPunto(null, punto(LAT_BASE, -60, 0, 10))).toBe(true)
  })

  test('rechaza un punto con precisión peor que el máximo', () => {
    expect(filtrarPunto(null, punto(LAT_BASE, -60, 0, 60))).toBe(false)
  })

  test('rechaza un punto demasiado cercano al último (menos de 5 m)', () => {
    const ultimo = punto(LAT_BASE, -60, 0, 5)
    const nuevo = punto(LAT_BASE + offsetLatKm(0.001), -60, 1, 5) // 1 m
    expect(filtrarPunto(ultimo, nuevo)).toBe(false)
  })

  test('acepta un punto suficientemente lejos del último', () => {
    const ultimo = punto(LAT_BASE, -60, 0, 5)
    const nuevo = punto(LAT_BASE + offsetLatKm(0.01), -60, 1, 5) // 10 m
    expect(filtrarPunto(ultimo, nuevo)).toBe(true)
  })

  test('respeta opciones custom', () => {
    const ultimo = punto(LAT_BASE, -60, 0, 5)
    const nuevo = punto(LAT_BASE + offsetLatKm(0.008), -60, 1, 5) // 8 m
    expect(filtrarPunto(ultimo, nuevo, { precisionMax: 50, distanciaMinM: 10 })).toBe(false)
    expect(filtrarPunto(ultimo, nuevo, { precisionMax: 50, distanciaMinM: 5 })).toBe(true)
  })
})

describe('simplificar', () => {
  test('devuelve el mismo array si hay 2 puntos o menos', () => {
    const puntos = [punto(LAT_BASE, -60, 0), punto(LAT_BASE + 0.01, -60, 1)]
    expect(simplificar(puntos)).toEqual(puntos)
    expect(simplificar([punto(LAT_BASE, -60, 0)])).toEqual([punto(LAT_BASE, -60, 0)])
  })

  test('elimina un punto colineal intermedio', () => {
    const inicio = punto(LAT_BASE, -60, 0)
    const medio = punto(LAT_BASE + offsetLatKm(0.5), -60, 1)
    const fin = punto(LAT_BASE + offsetLatKm(1), -60, 2)
    const resultado = simplificar([inicio, medio, fin], 10)
    expect(resultado).toEqual([inicio, fin])
  })

  test('conserva un punto con desvío de 30 m (tolerancia 10 m)', () => {
    const inicio = punto(LAT_BASE, -60, 0)
    const fin = punto(LAT_BASE + offsetLatKm(1), -60, 2)
    const desviado = punto(
      LAT_BASE + offsetLatKm(0.5),
      -60 + offsetLngKm(0.03, LAT_BASE), // 30 m al este
      1,
    )
    const resultado = simplificar([inicio, desviado, fin], 10)
    expect(resultado).toHaveLength(3)
    expect(resultado[1]).toEqual(desviado)
  })

  test('conserva siempre el primer y el último punto', () => {
    const inicio = punto(LAT_BASE, -60, 0)
    const medio1 = punto(LAT_BASE + offsetLatKm(0.3), -60, 1)
    const medio2 = punto(LAT_BASE + offsetLatKm(0.6), -60, 2)
    const fin = punto(LAT_BASE + offsetLatKm(1), -60, 3)
    const resultado = simplificar([inicio, medio1, medio2, fin], 10)
    expect(resultado[0]).toEqual(inicio)
    expect(resultado[resultado.length - 1]).toEqual(fin)
  })
})

describe('kmDeTrack', () => {
  test('suma 0 para un solo punto o track vacío', () => {
    expect(kmDeTrack([])).toBe(0)
    expect(kmDeTrack([punto(LAT_BASE, -60)])).toBe(0)
  })

  test('dos puntos separados por 1 km dan ~1 km', () => {
    const a = punto(LAT_BASE, -60)
    const b = punto(LAT_BASE + offsetLatKm(1), -60)
    expect(kmDeTrack([a, b])).toBeCloseTo(1, 2)
  })

  test('suma las distancias de un track de varios puntos', () => {
    const a = punto(LAT_BASE, -60)
    const b = punto(LAT_BASE + offsetLatKm(1), -60)
    const c = punto(LAT_BASE + offsetLatKm(2), -60)
    expect(kmDeTrack([a, b, c])).toBeCloseTo(2, 2)
  })
})
