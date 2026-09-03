import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type {
  BaseLocal,
  EstadoRecorridoLocal,
  ItemCola,
  ObservacionLocal,
  PuntoLocal,
  RecorridoLocal,
} from './tipos'

export const NOMBRE_DB = 'visiovial'
/**
 * v2 agrega el índice `usuarioId` en `recorridos`. Los registros de la v1 no
 * tienen ese campo: quedan fuera del índice y por lo tanto se tratan como
 * ajenos (nunca se procesan ni se suben con la sesión actual).
 */
export const VERSION_DB = 2

const ERROR_SIN_INDEXEDDB = 'Este navegador no puede guardar el recorrido en el dispositivo.'

interface EsquemaVisiovial extends DBSchema {
  recorridos: { key: string; value: RecorridoLocal; indexes: { usuarioId: string } }
  puntos: { key: number; value: PuntoLocal; indexes: { recorridoId: string } }
  observaciones: { key: string; value: ObservacionLocal; indexes: { recorridoId: string } }
  cola: { key: string; value: ItemCola }
}

export type DbVisiovial = IDBPDatabase<EsquemaVisiovial>

/** Stores que se vacían al cerrar sesión. */
const STORES = ['recorridos', 'puntos', 'observaciones', 'cola'] as const

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

/** Vacía los cuatro stores locales. Se usa al cerrar sesión. */
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
  encolar,
  obtenerItemCola,
  guardarItemCola,
  listarCola,
  borrarItemCola,
}
