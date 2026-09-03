import { describe, expect, test } from 'vitest'
import {
  agregarPunto,
  duracionMs,
  finalizar,
  GRABADOR_INICIAL,
  iniciar,
  pausar,
  reanudar,
  retomar,
} from '@/lib/local/grabador'
import type { PuntoGps } from '@/lib/track'

const ID = 'a1b2'
const T0 = 1_700_000_000_000

/** ~11 m por cada 0.0001° de latitud. */
function punto(indice: number, precision = 10): PuntoGps {
  return { lat: -36.85 + indice * 0.0001, lng: -57.88, t: T0 + indice * 1000, precision }
}

describe('grabador', () => {
  test('iniciar deja el grabador grabando y sin kilómetros', () => {
    const grabador = iniciar(ID, T0)

    expect(grabador.estado).toBe('grabando')
    expect(grabador.recorridoId).toBe(ID)
    expect(grabador.inicio).toBe(T0)
    expect(grabador.km).toBe(0)
    expect(grabador.puntosGps).toHaveLength(0)
  })

  test('descarta puntos de baja precisión sin cambiar el estado', () => {
    const grabador = iniciar(ID, T0)

    const siguiente = agregarPunto(grabador, punto(0, 80))

    expect(siguiente).toBe(grabador)
  })

  test('descarta puntos a menos de 5 m del último aceptado', () => {
    const conPunto = agregarPunto(iniciar(ID, T0), punto(0))
    const casiIgual: PuntoGps = { ...punto(0), lat: punto(0).lat + 0.00001, t: T0 + 500 }

    expect(agregarPunto(conPunto, casiIgual)).toBe(conPunto)
  })

  test('acumula kilómetros entre puntos aceptados', () => {
    let grabador = iniciar(ID, T0)
    grabador = agregarPunto(grabador, punto(0))
    grabador = agregarPunto(grabador, punto(1))
    grabador = agregarPunto(grabador, punto(2))

    expect(grabador.puntosGps).toHaveLength(3)
    expect(grabador.km).toBeGreaterThan(0.02)
    expect(grabador.km).toBeLessThan(0.03)
    expect(grabador.ultimo).toEqual(punto(2))
  })

  test('en pausa no incorpora puntos y al reanudar vuelve a hacerlo', () => {
    const grabando = agregarPunto(iniciar(ID, T0), punto(0))
    const pausado = pausar(grabando)

    expect(pausado.estado).toBe('pausado')
    expect(agregarPunto(pausado, punto(1))).toBe(pausado)

    const reanudado = reanudar(pausado)
    expect(reanudado.estado).toBe('grabando')
    expect(agregarPunto(reanudado, punto(1)).puntosGps).toHaveLength(2)
  })

  test('finalizar registra el fin y deja de aceptar puntos', () => {
    const grabador = finalizar(agregarPunto(iniciar(ID, T0), punto(0)), T0 + 60_000)

    expect(grabador.estado).toBe('finalizado')
    expect(grabador.fin).toBe(T0 + 60_000)
    expect(agregarPunto(grabador, punto(5))).toBe(grabador)
    expect(duracionMs(grabador, T0 + 999_999)).toBe(60_000)
  })

  test('retomar reconstruye kilómetros y último punto desde los puntos guardados', () => {
    const puntos = [punto(0), punto(1), punto(2)]

    const grabador = retomar(ID, T0, puntos)

    expect(grabador.estado).toBe('grabando')
    expect(grabador.ultimo).toEqual(punto(2))
    expect(grabador.km).toBeCloseTo(agregarPunto(agregarPunto(agregarPunto(iniciar(ID, T0), punto(0)), punto(1)), punto(2)).km, 6)
  })

  test('el estado inicial no acepta puntos', () => {
    expect(agregarPunto(GRABADOR_INICIAL, punto(0))).toBe(GRABADOR_INICIAL)
    expect(duracionMs(GRABADOR_INICIAL, T0)).toBe(0)
  })
})
