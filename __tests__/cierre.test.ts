import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import { cerrarRecorrido, MENSAJE_DESCARTADO } from '@/lib/local/cierre'
import {
  cerrarDb,
  guardarItemCola,
  guardarPunto,
  guardarRecorrido,
  listarCola,
  obtenerItemCola,
  obtenerRecorrido,
} from '@/lib/local/db'
import type { PuntoLocal, RecorridoLocal } from '@/lib/local/tipos'

const ID = '11111111-1111-4111-8111-111111111111'
const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const T0 = 1_700_000_000_000
const FIN = T0 + 30 * 60 * 1000

const RECORRIDO: RecorridoLocal = {
  id: ID,
  usuarioId: USUARIO,
  inicio: new Date(T0).toISOString(),
  estado: 'en_curso',
  municipio: 'maipu',
  puntosGps: 0,
  km: 0,
}

/** ~111 m por cada 0.001° de latitud. */
function punto(indice: number): PuntoLocal {
  return { recorridoId: ID, lat: -36.85 + indice * 0.001, lng: -57.88, t: T0 + indice * 1000, precision: 8 }
}

beforeEach(async () => {
  await cerrarDb()
  await new Promise<void>((resolver) => {
    const peticion = indexedDB.deleteDatabase('visiovial')
    peticion.onsuccess = () => resolver()
    peticion.onerror = () => resolver()
    peticion.onblocked = () => resolver()
  })
})

describe('cerrarRecorrido', () => {
  test('recalcula km y puntos desde lo persistido y encola en la misma transacción', async () => {
    await guardarRecorrido(RECORRIDO)
    await guardarPunto(punto(0))
    await guardarPunto(punto(1))
    await guardarPunto(punto(2))

    const resultado = await cerrarRecorrido(ID, FIN)

    expect(resultado.ok).toBe(true)
    const guardado = await obtenerRecorrido(ID)
    expect(guardado?.estado).toBe('finalizado')
    expect(guardado?.puntosGps).toBe(3)
    expect(guardado?.km).toBeGreaterThan(0.2)
    expect(guardado?.km).toBeLessThan(0.3)
    expect(guardado?.fin).toBe(new Date(FIN).toISOString())
    expect(await obtenerItemCola(ID)).toEqual({ recorridoId: ID, intentos: 0, proximoIntento: 0 })
  })

  test('no reinicia los intentos de un item de cola que ya existía', async () => {
    await guardarRecorrido(RECORRIDO)
    await guardarPunto(punto(0))
    await guardarPunto(punto(1))
    await guardarItemCola({ recorridoId: ID, intentos: 3, proximoIntento: 999, ultimoError: 'x' })

    await cerrarRecorrido(ID, FIN)

    expect((await obtenerItemCola(ID))?.intentos).toBe(3)
  })

  test('con menos de dos puntos lo descarta y no lo encola', async () => {
    await guardarRecorrido(RECORRIDO)
    await guardarPunto(punto(0))

    const resultado = await cerrarRecorrido(ID, FIN)

    expect(resultado).toEqual({ ok: false, motivo: 'descartado', mensaje: MENSAJE_DESCARTADO })
    const guardado = await obtenerRecorrido(ID)
    expect(guardado?.estado).toBe('descartado')
    expect(guardado?.puntosGps).toBe(1)
    expect(guardado?.km).toBe(0)
    expect(await listarCola()).toEqual([])
  })

  test('sin puntos también se descarta', async () => {
    await guardarRecorrido(RECORRIDO)

    const resultado = await cerrarRecorrido(ID, FIN)

    expect(resultado.ok).toBe(false)
    expect((await obtenerRecorrido(ID))?.estado).toBe('descartado')
    expect(await listarCola()).toEqual([])
  })

  test('una pausa real en el track no se acredita como km recorridos', async () => {
    await guardarRecorrido(RECORRIDO)
    // Cluster 1: 2 puntos, ~1,1 km entre ambos (0.01° de latitud), 5 s de por
    // medio (bien por debajo del umbral: no corta).
    await guardarPunto({ recorridoId: ID, lat: -36.85, lng: -57.88, t: T0, precision: 8 })
    await guardarPunto({ recorridoId: ID, lat: -36.86, lng: -57.88, t: T0 + 5_000, precision: 8 })
    // Hueco de 40 s (por encima de `UMBRAL_INTERRUPCION_MS`) y un salto grande
    // de posición: una pausa real, no una demora de una lectura.
    await guardarPunto({ recorridoId: ID, lat: -37.5, lng: -57.88, t: T0 + 5_000 + 40_000, precision: 8 })
    // Cluster 2: otro punto a ~1,1 km del anterior, otra vez 5 s después.
    await guardarPunto({
      recorridoId: ID,
      lat: -37.51,
      lng: -57.88,
      t: T0 + 5_000 + 40_000 + 5_000,
      precision: 8,
    })

    const resultado = await cerrarRecorrido(ID, FIN)

    expect(resultado.ok).toBe(true)
    const guardado = await obtenerRecorrido(ID)
    // Solo los ~2,2 km de los dos clusters (1,1 + 1,1); el salto de ~72 km
    // entre -36.86 y -37.5 de latitud no se acredita.
    expect(guardado?.km).toBeGreaterThan(2)
    expect(guardado?.km).toBeLessThan(3)
  })

  test('un recorrido que ya no está en el dispositivo devuelve el motivo', async () => {
    const resultado = await cerrarRecorrido(ID, FIN)

    expect(resultado).toEqual({
      ok: false,
      motivo: 'sin_recorrido',
      mensaje: expect.stringMatching(/no se encontró/i),
    })
    expect(await listarCola()).toEqual([])
  })
})
