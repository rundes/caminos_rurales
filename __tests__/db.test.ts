import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  borrarCuadrosSubidos,
  borrarItemCola,
  borrarItemColaCuadros,
  cambiarEstadoRecorrido,
  cerrarDb,
  contarCuadros,
  encolar,
  encolarCuadros,
  guardarImpacto,
  guardarMuestra,
  guardarCuadro,
  guardarObservacion,
  guardarPunto,
  guardarRecorrido,
  listarCola,
  listarColaCuadros,
  listarCuadros,
  listarCuadrosPendientes,
  limpiarLocal,
  marcarCuadro,
  marcarCuadrosEnError,
  marcarDifuminado,
  listarImpactos,
  listarMuestras,
  listarObservaciones,
  listarPuntos,
  listarRecorridos,
  obtenerItemCola,
  obtenerItemColaCuadros,
  obtenerRecorrido,
  recorridoEnCurso,
} from '@/lib/local/db'
import type {
  CuadroNuevo,
  ImpactoLocal,
  MuestraLocal,
  ObservacionLocal,
  RecorridoLocal,
} from '@/lib/local/tipos'

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

function muestra(t: number, recorridoId = ID): MuestraLocal {
  return {
    recorridoId,
    t,
    lat: -36.85,
    lng: -57.88,
    velocidadKmh: 40,
    rumbo: 90,
    altitud: 12,
    rmsVertical: 1.5,
    picoVertical: 4,
    frenadas: 0,
    laterales: 0,
    muestras: 120,
    calidad: 'regular',
  }
}

function impacto(t: number, recorridoId = ID): ImpactoLocal {
  return { recorridoId, t, lat: -36.85, lng: -57.88, pico: 8.5, velocidadKmh: 40 }
}

function cuadro(t: number, recorridoId = ID): CuadroNuevo {
  return {
    recorridoId,
    t,
    lat: -36.85,
    lng: -57.88,
    rumbo: 90,
    velocidadKmh: 40,
    blob: new Blob([`cuadro-${t}`], { type: 'image/jpeg' }),
    estadoSubida: 'pendiente',
  }
}

/**
 * Crea una base v4 "a mano" (con `blob` adentro de la fila, como antes de
 * separar el store) usando IndexedDB directo, para probar la migración a v5
 * sin pasar por `abrirDb` (que ya abre en v5).
 */
async function crearBaseV4ConCuadro(): Promise<void> {
  await new Promise<void>((resolver, rechazar) => {
    const peticion = indexedDB.open('visiovial', 4)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      db.createObjectStore('puntos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('observaciones', { keyPath: 'id' }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('cola', { keyPath: 'recorridoId' })
      db.createObjectStore('recorridos', { keyPath: 'id' }).createIndex('usuarioId', 'usuarioId')
      db.createObjectStore('muestras', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('impactos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      db
        .createObjectStore('cuadros', { keyPath: 'id', autoIncrement: true })
        .createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('colaCuadros', { keyPath: 'recorridoId' })
    }
    peticion.onsuccess = () => {
      const db = peticion.result
      const tx = db.transaction('cuadros', 'readwrite')
      tx.objectStore('cuadros').add({
        recorridoId: ID,
        t: 100,
        lat: -36.85,
        lng: -57.88,
        rumbo: 90,
        velocidadKmh: 40,
        blob: new Blob(['imagen-v4'], { type: 'image/jpeg' }),
        estadoSubida: 'pendiente',
      })
      tx.oncomplete = () => {
        db.close()
        resolver()
      }
      tx.onerror = () => rechazar(tx.error)
    }
    peticion.onerror = () => rechazar(peticion.error)
  })
}

/**
 * Crea una base v5 "a mano" (blob ya separado, pero sin `cuadros.difuminado`,
 * que recién existe desde v6) usando IndexedDB directo, para probar la
 * migración a v6 sin pasar por `abrirDb` (que ya abre en v6).
 */
async function crearBaseV5ConCuadro(): Promise<void> {
  await new Promise<void>((resolver, rechazar) => {
    const peticion = indexedDB.open('visiovial', 5)
    peticion.onupgradeneeded = () => {
      const db = peticion.result
      db.createObjectStore('puntos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('observaciones', { keyPath: 'id' }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('cola', { keyPath: 'recorridoId' })
      db.createObjectStore('recorridos', { keyPath: 'id' }).createIndex('usuarioId', 'usuarioId')
      db.createObjectStore('muestras', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('impactos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      const cuadros = db.createObjectStore('cuadros', { keyPath: 'id', autoIncrement: true })
      cuadros.createIndex('recorridoId', 'recorridoId')
      cuadros.createIndex('porRecorridoEstado', ['recorridoId', 'estadoSubida'])
      db.createObjectStore('colaCuadros', { keyPath: 'recorridoId' })
      db.createObjectStore('blobs', { keyPath: 'id' })
    }
    peticion.onsuccess = () => {
      const db = peticion.result
      const tx = db.transaction(['cuadros', 'blobs'], 'readwrite')
      tx.objectStore('cuadros').add({
        id: 1,
        recorridoId: ID,
        t: 100,
        lat: -36.85,
        lng: -57.88,
        rumbo: 90,
        velocidadKmh: 40,
        estadoSubida: 'pendiente',
        tieneBlob: true,
        // Sin `difuminado`: fila de antes de v6.
      })
      tx.objectStore('blobs').put({ id: 1, blob: new Blob(['imagen-v5'], { type: 'image/jpeg' }) })
      tx.oncomplete = () => {
        db.close()
        resolver()
      }
      tx.onerror = () => rechazar(tx.error)
    }
    peticion.onerror = () => rechazar(peticion.error)
  })
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

  test('guarda muestras de sensores por recorrido y las devuelve ordenadas', async () => {
    await guardarMuestra(muestra(200))
    await guardarMuestra(muestra(100))
    await guardarMuestra(muestra(50, 'otro'))

    const muestras = await listarMuestras(ID)

    expect(muestras.map((m) => m.t)).toEqual([100, 200])
    expect(muestras[0].calidad).toBe('regular')
    expect(await listarMuestras('otro')).toHaveLength(1)
  })

  test('guarda impactos por recorrido y los devuelve ordenados', async () => {
    await guardarImpacto(impacto(300))
    await guardarImpacto(impacto(100))
    await guardarImpacto(impacto(200, 'otro'))

    expect((await listarImpactos(ID)).map((i) => i.t)).toEqual([100, 300])
    expect(await listarImpactos('otro')).toHaveLength(1)
  })

  test('guarda cuadros por recorrido (sin blob en la fila), los cuenta y los filtra por estado', async () => {
    const id = await guardarCuadro(cuadro(200))
    await guardarCuadro(cuadro(100))
    await guardarCuadro(cuadro(50, 'otro'))

    const cuadros = await listarCuadros(ID)
    expect(cuadros.map((c) => c.t)).toEqual([100, 200])
    expect(cuadros[0].tieneBlob).toBe(true)
    expect((cuadros[0] as unknown as { blob?: Blob }).blob).toBeUndefined()
    expect(await contarCuadros(ID)).toBe(2)
    expect(await contarCuadros('otro')).toBe(1)

    await marcarCuadro(id, 'subida', 'uid/rec/cuadro-200-cuadro.jpg')

    expect(await contarCuadros(ID, 'pendiente')).toBe(1)
    expect(await contarCuadros(ID, 'subida')).toBe(1)
    const subido = (await listarCuadros(ID, 'subida'))[0]
    expect(subido.t).toBe(200)
    expect(subido.ruta).toBe('uid/rec/cuadro-200-cuadro.jpg')
  })

  test('listarCuadrosPendientes carga el blob y respeta el límite del lote', async () => {
    await guardarCuadro(cuadro(100))
    await guardarCuadro(cuadro(200))
    await guardarCuadro(cuadro(300))

    const lote = await listarCuadrosPendientes(ID, 2)

    expect(lote).toHaveLength(2)
    expect(lote.map((c) => c.t)).toEqual([100, 200])
    // `fake-indexeddb` en jsdom no clona el `Blob` como un browser real (queda
    // como objeto plano), así que acá solo se comprueba que viajó algo: el
    // contrato real (Blob de verdad) lo valida el navegador en producción.
    expect(lote[0].blob).toBeDefined()
  })

  test('borrarCuadrosSubidos libera solo los blobs de los ya subidos', async () => {
    const subido = await guardarCuadro(cuadro(100))
    await guardarCuadro(cuadro(200))
    await marcarCuadro(subido, 'subida', 'ruta')

    expect(await borrarCuadrosSubidos(ID)).toBe(1)

    const cuadros = await listarCuadros(ID)
    expect(cuadros.find((c) => c.t === 100)?.tieneBlob).toBe(false)
    expect(cuadros.find((c) => c.t === 200)?.tieneBlob).toBe(true)
    // La fila queda: sigue contando como capturado.
    expect(await contarCuadros(ID)).toBe(2)
  })

  test('marcarCuadrosEnError deja los pendientes en error y libera sus blobs', async () => {
    await guardarCuadro(cuadro(100))
    await guardarCuadro(cuadro(200))

    expect(await marcarCuadrosEnError(ID)).toBe(2)

    const cuadros = await listarCuadros(ID)
    expect(cuadros.every((c) => c.estadoSubida === 'error')).toBe(true)
    expect(cuadros.every((c) => c.tieneBlob === false)).toBe(true)
  })

  test('migra los blobs de v4 a v5: la fila queda sin blob y el blob se mueve al store nuevo', async () => {
    await crearBaseV4ConCuadro()

    const cuadros = await listarCuadros(ID)
    expect(cuadros).toHaveLength(1)
    expect(cuadros[0].tieneBlob).toBe(true)
    expect((cuadros[0] as unknown as { blob?: Blob }).blob).toBeUndefined()

    const pendientes = await listarCuadrosPendientes(ID, 10)
    expect(pendientes).toHaveLength(1)
    // Ídem: en este entorno de test el blob no clona como instancia real, pero
    // el punto de la migración es que se movió (no quedó en la fila vieja).
    expect(pendientes[0].blob).toBeDefined()
  })

  test('migra a v6: los cuadros de antes quedan con difuminado en false', async () => {
    await crearBaseV5ConCuadro()

    const cuadros = await listarCuadros(ID)
    expect(cuadros).toHaveLength(1)
    expect(cuadros[0].difuminado).toBe(false)
  })

  test('guardarCuadro guarda los cuadros nuevos con difuminado en false', async () => {
    await guardarCuadro(cuadro(100))

    const [fila] = await listarCuadros(ID)
    expect(fila.difuminado).toBe(false)
  })

  test('marcarDifuminado reemplaza el blob y marca el cuadro como procesado', async () => {
    const id = await guardarCuadro(cuadro(100))
    const nuevo = new Blob(['difuminado'], { type: 'image/jpeg' })

    await marcarDifuminado(id, nuevo)

    const [fila] = await listarCuadros(ID)
    expect(fila.difuminado).toBe(true)
    const [pendiente] = await listarCuadrosPendientes(ID, 10)
    expect(pendiente.blob).toBeDefined()
  })

  test('la cola de cuadros no reinicia los intentos y se puede borrar', async () => {
    await encolarCuadros(ID)
    expect(await obtenerItemColaCuadros(ID)).toEqual({
      recorridoId: ID,
      intentos: 0,
      proximoIntento: 0,
    })

    await encolarCuadros(ID)
    expect(await listarColaCuadros()).toHaveLength(1)

    await borrarItemColaCuadros(ID)
    expect(await listarColaCuadros()).toEqual([])
  })

  test('limpiarLocal vacía todos los stores', async () => {
    await guardarRecorrido(RECORRIDO)
    await guardarPunto({ recorridoId: ID, lat: -36.8, lng: -57.8, t: 1, precision: 8 })
    await guardarObservacion(OBSERVACION)
    await guardarMuestra(muestra(100))
    await guardarImpacto(impacto(100))
    await guardarCuadro(cuadro(100))
    await encolar(ID)
    await encolarCuadros(ID)

    await limpiarLocal()

    expect(await listarRecorridos(USUARIO)).toEqual([])
    expect(await listarPuntos(ID)).toEqual([])
    expect(await listarObservaciones(ID)).toEqual([])
    expect(await listarMuestras(ID)).toEqual([])
    expect(await listarImpactos(ID)).toEqual([])
    expect(await listarCuadros(ID)).toEqual([])
    expect(await listarCola()).toEqual([])
    expect(await listarColaCuadros()).toEqual([])
  })
})
