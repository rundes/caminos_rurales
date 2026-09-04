import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  borrarItemCola,
  cambiarEstadoRecorrido,
  cerrarDb,
  encolar,
  guardarObservacion,
  guardarPunto,
  guardarRecorrido,
  listarCola,
  limpiarLocal,
  listarObservaciones,
  listarPuntos,
  listarRecorridos,
  obtenerItemCola,
  obtenerRecorrido,
  recorridoEnCurso,
} from '@/lib/local/db'
import type { ObservacionLocal, RecorridoLocal } from '@/lib/local/tipos'

const ID = '11111111-1111-4111-8111-111111111111'
const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const OTRO_USUARIO = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'

const RECORRIDO: RecorridoLocal = {
  id: ID,
  usuarioId: USUARIO,
  inicio: '2026-09-03T10:00:00.000Z',
  estado: 'en_curso',
  municipio: 'maipu',
  puntosGps: 0,
  km: 0,
}

const OBSERVACION: ObservacionLocal = {
  id: '22222222-2222-4222-8222-222222222222',
  recorridoId: ID,
  tipo_falla: 'bache',
  severidad: 'alta',
  latitud: -36.85,
  longitud: -57.88,
  estadoSubida: 'pendiente',
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

describe('base local', () => {
  test('guarda y recupera un recorrido, y lo encuentra en curso', async () => {
    await guardarRecorrido(RECORRIDO)

    expect(await obtenerRecorrido(ID)).toEqual(RECORRIDO)
    expect(await recorridoEnCurso(USUARIO)).toEqual(RECORRIDO)

    await cambiarEstadoRecorrido(ID, 'finalizado')

    expect((await obtenerRecorrido(ID))?.estado).toBe('finalizado')
    expect(await recorridoEnCurso(USUARIO)).toBeUndefined()
  })

  test('no devuelve recorridos de otro usuario', async () => {
    await guardarRecorrido(RECORRIDO)
    await guardarRecorrido({ ...RECORRIDO, id: 'ajeno', usuarioId: OTRO_USUARIO })

    expect((await listarRecorridos(USUARIO)).map((r) => r.id)).toEqual([ID])
    expect(await recorridoEnCurso(OTRO_USUARIO)).toEqual({
      ...RECORRIDO,
      id: 'ajeno',
      usuarioId: OTRO_USUARIO,
    })
  })

  test('guarda puntos por recorrido y los devuelve ordenados por tiempo', async () => {
    await guardarPunto({ recorridoId: ID, lat: -36.8, lng: -57.8, t: 200, precision: 8 })
    await guardarPunto({ recorridoId: ID, lat: -36.9, lng: -57.9, t: 100, precision: 9 })
    await guardarPunto({ recorridoId: 'otro', lat: 0, lng: 0, t: 50, precision: 5 })

    const puntos = await listarPuntos(ID)

    expect(puntos.map((p) => p.t)).toEqual([100, 200])
  })

  test('guarda observaciones con su archivo y las lista por recorrido', async () => {
    const archivo = new Blob(['contenido'], { type: 'image/jpeg' })
    await guardarObservacion({ ...OBSERVACION, archivo, nombreArchivo: 'foto.jpg', tipoArchivo: 'image/jpeg' })

    const observaciones = await listarObservaciones(ID)

    expect(observaciones).toHaveLength(1)
    expect(observaciones[0].nombreArchivo).toBe('foto.jpg')
    expect(observaciones[0].archivo).toBeDefined()
    expect(observaciones[0].tipoArchivo).toBe('image/jpeg')
  })

  test('la cola no reinicia los intentos al encolar de nuevo y se puede borrar', async () => {
    await encolar(ID)
    const item = await obtenerItemCola(ID)
    expect(item).toEqual({ recorridoId: ID, intentos: 0, proximoIntento: 0 })

    await guardarObservacion(OBSERVACION)
    await encolar(ID)
    expect(await listarCola()).toHaveLength(1)

    await borrarItemCola(ID)
    expect(await listarCola()).toEqual([])
  })

  test('limpiarLocal vacía los cuatro stores', async () => {
    await guardarRecorrido(RECORRIDO)
    await guardarPunto({ recorridoId: ID, lat: -36.8, lng: -57.8, t: 1, precision: 8 })
    await guardarObservacion(OBSERVACION)
    await encolar(ID)

    await limpiarLocal()

    expect(await listarRecorridos(USUARIO)).toEqual([])
    expect(await listarPuntos(ID)).toEqual([])
    expect(await listarObservaciones(ID)).toEqual([])
    expect(await listarCola()).toEqual([])
  })
})
