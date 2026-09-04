import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  BaseCuadros,
  BaseLocal,
  CuadroGuardado,
  CuadroLocal,
  EstadoRecorridoLocal,
  EstadoSubida,
  ImpactoLocal,
  ItemCola,
  ItemColaCuadros,
  MuestraLocal,
  ObservacionLocal,
  PuntoLocal,
  RecorridoLocal,
} from './tipos'

export const NOMBRE_DB = 'visiovial'
/**
 * v2 agrega el índice `usuarioId` en `recorridos`. Los registros de la v1 no
 * tienen ese campo: quedan fuera del índice y por lo tanto se tratan como
 * ajenos (nunca se procesan ni se suben con la sesión actual).
 *
 * v3 agrega los stores `muestras` e `impactos` de la captura por sensores.
 *
 * v4 agrega `cuadros` (imágenes de la cámara) y su cola `colaCuadros`.
 */
export const VERSION_DB = 4

const ERROR_SIN_INDEXEDDB = 'Este navegador no puede guardar el recorrido en el dispositivo.'

interface EsquemaVisiovial extends DBSchema {
  recorridos: { key: string; value: RecorridoLocal; indexes: { usuarioId: string } }
  puntos: { key: number; value: PuntoLocal; indexes: { recorridoId: string } }
  observaciones: { key: string; value: ObservacionLocal; indexes: { recorridoId: string } }
  cola: { key: string; value: ItemCola }
  muestras: { key: number; value: MuestraLocal; indexes: { recorridoId: string } }
  impactos: { key: number; value: ImpactoLocal; indexes: { recorridoId: string } }
  cuadros: { key: number; value: CuadroLocal; indexes: { recorridoId: string } }
  colaCuadros: { key: string; value: ItemColaCuadros }
}

export type DbVisiovial = IDBPDatabase<EsquemaVisiovial>

/** Stores que se vacían al cerrar sesión. */
const STORES = [
  'recorridos',
  'puntos',
  'observaciones',
  'cola',
  'muestras',
  'impactos',
  'cuadros',
  'colaCuadros',
] as const

let conexion: Promise<DbVisiovial> | null = null

function olvidar(): void {
  conexion = null
}

/**
 * Abre (una sola vez por pestaña) la base local. La conexión se memoiza en un
 * módulo, así que todos los hooks comparten la misma. Si la apertura falla la
 * promesa memoizada se descarta, para que el siguiente intento vuelva a abrir.
 */
export function abrirDb(): Promise<DbVisiovial> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(ERROR_SIN_INDEXEDDB))
  if (!conexion) {
    conexion = openDB<EsquemaVisiovial>(NOMBRE_DB, VERSION_DB, {
      upgrade(db, anterior, _nueva, tx) {
        if (anterior < 1) {
          db.createObjectStore('puntos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
          db.createObjectStore('observaciones', { keyPath: 'id' }).createIndex('recorridoId', 'recorridoId')
          db.createObjectStore('cola', { keyPath: 'recorridoId' })
        }
        const recorridos =
          anterior < 1
            ? db.createObjectStore('recorridos', { keyPath: 'id' })
            : tx.objectStore('recorridos')
        if (!recorridos.indexNames.contains('usuarioId')) recorridos.createIndex('usuarioId', 'usuarioId')
        if (anterior < 3) {
          db.createObjectStore('muestras', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
          db.createObjectStore('impactos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
        }
        if (anterior < 4) {
          // La clave va adentro del valor (`keyPath`) porque la cola necesita
          // marcar cuadro por cuadro después de subirlo.
          db.createObjectStore('cuadros', { keyPath: 'id', autoIncrement: true }).createIndex(
            'recorridoId',
            'recorridoId',
          )
          db.createObjectStore('colaCuadros', { keyPath: 'recorridoId' })
        }
      },
      // Otra pestaña quiere migrar: cerramos para no bloquearla.
      blocking(_anterior, _nueva, evento) {
        ;(evento.target as unknown as DbVisiovial)?.close?.()
        olvidar()
      },
      blocked() {
        olvidar()
      },
      terminated() {
        olvidar()
      },
    })
    conexion.catch((error) => {
      console.error('[db]', error)
      olvidar()
    })
  }
  return conexion
}

/** Cierra y olvida la conexión memoizada (solo se usa en tests y al salir). */
export async function cerrarDb(): Promise<void> {
  const pendiente = conexion
  if (!pendiente) return
  olvidar()
  try {
    ;(await pendiente).close()
  } catch (error) {
    console.error('[db]', error)
  }
}

/** Vacía todos los stores locales. Se usa al cerrar sesión. */
export async function limpiarLocal(): Promise<void> {
  const db = await abrirDb()
  const tx = db.transaction(STORES, 'readwrite')
  await Promise.all([...STORES.map((store) => tx.objectStore(store).clear()), tx.done])
}

export async function guardarRecorrido(recorrido: RecorridoLocal): Promise<void> {
  const db = await abrirDb()
  await db.put('recorridos', recorrido)
}

export async function obtenerRecorrido(id: string): Promise<RecorridoLocal | undefined> {
  const db = await abrirDb()
  return db.get('recorridos', id)
}

/** Recorridos del usuario en sesión. Los de la v1 (sin `usuarioId`) quedan afuera. */
export async function listarRecorridos(usuarioId: string): Promise<RecorridoLocal[]> {
  const db = await abrirDb()
  return db.getAllFromIndex('recorridos', 'usuarioId', usuarioId)
}

/** Recorrido del usuario que quedó abierto de una sesión anterior. */
export async function recorridoEnCurso(usuarioId: string): Promise<RecorridoLocal | undefined> {
  const propios = await listarRecorridos(usuarioId)
  return propios.find((r) => r.estado === 'en_curso')
}

export async function cambiarEstadoRecorrido(id: string, estado: EstadoRecorridoLocal): Promise<void> {
  const db = await abrirDb()
  const recorrido = await db.get('recorridos', id)
  if (!recorrido) return
  await db.put('recorridos', { ...recorrido, estado })
}

export async function guardarPunto(punto: PuntoLocal): Promise<void> {
  const db = await abrirDb()
  await db.add('puntos', punto)
}

export async function listarPuntos(recorridoId: string): Promise<PuntoLocal[]> {
  const db = await abrirDb()
  const puntos = await db.getAllFromIndex('puntos', 'recorridoId', recorridoId)
  return puntos.sort((a, b) => a.t - b.t)
}

export async function guardarObservacion(observacion: ObservacionLocal): Promise<void> {
  const db = await abrirDb()
  await db.put('observaciones', observacion)
}

export async function listarObservaciones(recorridoId: string): Promise<ObservacionLocal[]> {
  const db = await abrirDb()
  return db.getAllFromIndex('observaciones', 'recorridoId', recorridoId)
}

export async function guardarMuestra(muestra: MuestraLocal): Promise<void> {
  const db = await abrirDb()
  await db.add('muestras', muestra)
}

/** Segmentos de sensores de un recorrido, en orden cronológico. */
export async function listarMuestras(recorridoId: string): Promise<MuestraLocal[]> {
  const db = await abrirDb()
  const muestras = await db.getAllFromIndex('muestras', 'recorridoId', recorridoId)
  return muestras.sort((a, b) => a.t - b.t)
}

export async function guardarImpacto(impacto: ImpactoLocal): Promise<void> {
  const db = await abrirDb()
  await db.add('impactos', impacto)
}

/** Impactos detectados en un recorrido, en orden cronológico. */
export async function listarImpactos(recorridoId: string): Promise<ImpactoLocal[]> {
  const db = await abrirDb()
  const impactos = await db.getAllFromIndex('impactos', 'recorridoId', recorridoId)
  return impactos.sort((a, b) => a.t - b.t)
}

/** Encola un recorrido para subir. Si ya estaba encolado no reinicia sus intentos. */
export async function encolar(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  const existente = await db.get('cola', recorridoId)
  if (existente) return
  await db.put('cola', { recorridoId, intentos: 0, proximoIntento: 0 })
}

export async function obtenerItemCola(recorridoId: string): Promise<ItemCola | undefined> {
  const db = await abrirDb()
  return db.get('cola', recorridoId)
}

export async function guardarItemCola(item: ItemCola): Promise<void> {
  const db = await abrirDb()
  await db.put('cola', item)
}

export async function listarCola(): Promise<ItemCola[]> {
  const db = await abrirDb()
  return db.getAll('cola')
}

export async function borrarItemCola(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  await db.delete('cola', recorridoId)
}

/** Guarda un cuadro de la cámara y devuelve la clave que le asignó IndexedDB. */
export async function guardarCuadro(cuadro: CuadroLocal): Promise<number> {
  const db = await abrirDb()
  return db.add('cuadros', cuadro)
}

/** Cuadros de un recorrido, en orden cronológico y opcionalmente por estado. */
export async function listarCuadros(
  recorridoId: string,
  estado?: EstadoSubida,
): Promise<CuadroGuardado[]> {
  const db = await abrirDb()
  const cuadros = (await db.getAllFromIndex('cuadros', 'recorridoId', recorridoId)) as CuadroGuardado[]
  const filtrados = estado ? cuadros.filter((c) => c.estadoSubida === estado) : cuadros
  return filtrados.sort((a, b) => a.t - b.t)
}

export async function contarCuadros(recorridoId: string, estado?: EstadoSubida): Promise<number> {
  const db = await abrirDb()
  if (!estado) return db.countFromIndex('cuadros', 'recorridoId', recorridoId)
  return (await listarCuadros(recorridoId, estado)).length
}

/** Deja el cuadro en el estado indicado, guardando la ruta del objeto subido. */
export async function marcarCuadro(id: number, estado: EstadoSubida, ruta?: string): Promise<void> {
  const db = await abrirDb()
  const cuadro = await db.get('cuadros', id)
  if (!cuadro) return
  await db.put('cuadros', { ...cuadro, estadoSubida: estado, ...(ruta ? { ruta } : {}) })
}

/**
 * Libera los blobs de los cuadros ya subidos: la fila queda (para el contador
 * y la ruta) pero la imagen, que es lo que ocupa, se borra del dispositivo.
 */
export async function borrarCuadrosSubidos(recorridoId: string): Promise<number> {
  const db = await abrirDb()
  const subidos = (await listarCuadros(recorridoId, 'subida')).filter((c) => c.blob !== undefined)
  for (const cuadro of subidos) {
    await db.put('cuadros', { ...cuadro, blob: undefined })
  }
  return subidos.length
}

/**
 * Da por perdidos los cuadros pendientes de un recorrido: quedan en `error` y
 * sin blob. La fila se conserva para poder contarlos en el resumen; el blob se
 * libera porque ya no se va a reintentar la subida.
 */
export async function marcarCuadrosEnError(recorridoId: string): Promise<number> {
  const db = await abrirDb()
  const pendientes = await listarCuadros(recorridoId, 'pendiente')
  for (const cuadro of pendientes) {
    await db.put('cuadros', { ...cuadro, estadoSubida: 'error', blob: undefined })
  }
  return pendientes.length
}

/** Encola los cuadros de un recorrido. Si ya estaba encolado no reinicia sus intentos. */
export async function encolarCuadros(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  const existente = await db.get('colaCuadros', recorridoId)
  if (existente) return
  await db.put('colaCuadros', { recorridoId, intentos: 0, proximoIntento: 0 })
}

export async function obtenerItemColaCuadros(
  recorridoId: string,
): Promise<ItemColaCuadros | undefined> {
  const db = await abrirDb()
  return db.get('colaCuadros', recorridoId)
}

export async function guardarItemColaCuadros(item: ItemColaCuadros): Promise<void> {
  const db = await abrirDb()
  await db.put('colaCuadros', item)
}

export async function listarColaCuadros(): Promise<ItemColaCuadros[]> {
  const db = await abrirDb()
  return db.getAll('colaCuadros')
}

export async function borrarItemColaCuadros(recorridoId: string): Promise<void> {
  const db = await abrirDb()
  await db.delete('colaCuadros', recorridoId)
}

/** Implementación de `BaseLocal` sobre IndexedDB, para inyectar en la sincronización. */
export const baseLocal: BaseLocal = {
  guardarRecorrido,
  obtenerRecorrido,
  recorridoEnCurso,
  listarRecorridos,
  guardarPunto,
  listarPuntos,
  guardarObservacion,
  listarObservaciones,
  guardarMuestra,
  listarMuestras,
  guardarImpacto,
  listarImpactos,
  encolar,
  obtenerItemCola,
  guardarItemCola,
  listarCola,
  borrarItemCola,
}

/** Implementación de `BaseCuadros` sobre IndexedDB, para la cola de cuadros. */
export const baseCuadros: BaseCuadros = {
  listarRecorridos,
  listarCuadros,
  contarCuadros,
  marcarCuadro,
  borrarCuadrosSubidos,
  marcarCuadrosEnError,
  encolarCuadros,
  obtenerItemColaCuadros,
  guardarItemColaCuadros,
  listarColaCuadros,
  borrarItemColaCuadros,
}
