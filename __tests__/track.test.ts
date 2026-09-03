import { describe, expect, test } from 'vitest'
import {
  evaluarPlausibilidad,
  filtrarPunto,
  kmDeTrack,
  simplificar,
  velocidadMaximaKmh,
  velocidadMediaKmh,
  type PuntoGps,
} from '@/lib/track'

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

const INICIO = new Date('2026-09-03T10:00:00.000Z')
const UNA_HORA_DESPUES = new Date('2026-09-03T11:00:00.000Z')

describe('velocidadMediaKmh', () => {
  test('50 km en una hora son 50 km/h', () => {
    expect(velocidadMediaKmh(50, INICIO, UNA_HORA_DESPUES)).toBeCloseTo(50, 6)
  })

  test('30 km en media hora son 60 km/h', () => {
    const media = new Date(INICIO.getTime() + 30 * 60 * 1000)
    expect(velocidadMediaKmh(30, INICIO, media)).toBeCloseTo(60, 6)
  })

  test('duración nula con desplazamiento es infinita, sin desplazamiento es 0', () => {
    expect(velocidadMediaKmh(5, INICIO, INICIO)).toBe(Infinity)
    expect(velocidadMediaKmh(0, INICIO, INICIO)).toBe(0)
  })
})

describe('velocidadMaximaKmh', () => {
  test('devuelve la velocidad del segmento más rápido', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(0.01), -60, 10_000), // 10 m en 10 s = 3,6 km/h
      punto(LAT_BASE + offsetLatKm(1.01), -60, 20_000), // 1 km en 10 s = 360 km/h
    ]
    expect(velocidadMaximaKmh(puntos)).toBeCloseTo(360, 0)
  })

  test('ignora los segmentos de menos de 1 s', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(1), -60, 500), // salto de 1 km en 0,5 s: se descarta
    ]
    expect(velocidadMaximaKmh(puntos)).toBe(0)
  })

  test('un track de menos de dos puntos no tiene velocidad', () => {
    expect(velocidadMaximaKmh([])).toBe(0)
    expect(velocidadMaximaKmh([punto(LAT_BASE, -60, 0)])).toBe(0)
  })
})

describe('evaluarPlausibilidad', () => {
  test('acepta un recorrido normal de 40 km en una hora', () => {
    const resultado = evaluarPlausibilidad({ km: 40, inicio: INICIO, fin: UNA_HORA_DESPUES })
    expect(resultado).toEqual({ ok: true, motivos: [] })
  })

  test('rechaza una velocidad media por encima del límite', () => {
    const resultado = evaluarPlausibilidad({ km: 150, inicio: INICIO, fin: UNA_HORA_DESPUES })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/velocidad media/i)])
  })

  test('rechaza un salto entre muestras por encima del límite', () => {
    const puntos = [
      punto(LAT_BASE, -60, 0),
      punto(LAT_BASE + offsetLatKm(1), -60, 10_000), // 1 km en 10 s = 360 km/h
    ]
    const resultado = evaluarPlausibilidad({ km: 1, inicio: INICIO, fin: UNA_HORA_DESPUES, puntos })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/velocidad máxima/i)])
  })

  test('rechaza una precisión media insuficiente', () => {
    const resultado = evaluarPlausibilidad({
      km: 10,
      inicio: INICIO,
      fin: UNA_HORA_DESPUES,
      precisionMedia: 90,
    })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/precisión media/i)])
  })

  test('calcula la precisión media desde los puntos cuando no se pasa', () => {
    const puntos = [punto(LAT_BASE, -60, 0, 20), punto(LAT_BASE + offsetLatKm(0.05), -60, 60_000, 120)]
    const resultado = evaluarPlausibilidad({ km: 0.05, inicio: INICIO, fin: UNA_HORA_DESPUES, puntos })
    expect(resultado.ok).toBe(false) // media 70 m > 60 m
    expect(resultado.motivos).toEqual([expect.stringMatching(/precisión media/i)])
  })

  test('rechaza un recorrido que supera el techo de km', () => {
    const dias = new Date(INICIO.getTime() + 24 * 60 * 60 * 1000)
    const resultado = evaluarPlausibilidad({ km: 500, inicio: INICIO, fin: dias })
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toEqual([expect.stringMatching(/km fuera de rango/i)])
  })

  test('acumula todos los motivos y respeta límites custom', () => {
    const resultado = evaluarPlausibilidad(
      { km: 500, inicio: INICIO, fin: UNA_HORA_DESPUES, precisionMedia: 90 },
      { velocidadMediaMax: 120, velocidadMaximaMax: 160, precisionMediaMax: 60, kmMaxPorRecorrido: 400 },
    )
    expect(resultado.ok).toBe(false)
    expect(resultado.motivos).toHaveLength(3)

    const laxo = evaluarPlausibilidad(
      { km: 500, inicio: INICIO, fin: UNA_HORA_DESPUES, precisionMedia: 90 },
      { velocidadMediaMax: 600, velocidadMaximaMax: 900, precisionMediaMax: 200, kmMaxPorRecorrido: 900 },
    )
    expect(laxo).toEqual({ ok: true, motivos: [] })
  })
})
