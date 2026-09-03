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
export const VERSION_DB = 1

const ERROR_SIN_INDEXEDDB = 'Este navegador no puede guardar el recorrido en el dispositivo.'

interface EsquemaVisiovial extends DBSchema {
  recorridos: { key: string; value: RecorridoLocal }
  puntos: { key: number; value: PuntoLocal; indexes: { recorridoId: string } }
  observaciones: { key: string; value: ObservacionLocal; indexes: { recorridoId: string } }
  cola: { key: string; value: ItemCola }
}

export type DbVisiovial = IDBPDatabase<EsquemaVisiovial>

let conexion: Promise<DbVisiovial> | null = null

/**
 * Abre (una sola vez por pestaña) la base local. La conexión se memoiza en un
 * módulo, así que todos los hooks comparten la misma.
 */
export function abrirDb(): Promise<DbVisiovial> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error(ERROR_SIN_INDEXEDDB))
  conexion ??= openDB<EsquemaVisiovial>(NOMBRE_DB, VERSION_DB, {
    upgrade(db) {
      db.createObjectStore('recorridos', { keyPath: 'id' })
      db.createObjectStore('puntos', { autoIncrement: true }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('observaciones', { keyPath: 'id' }).createIndex('recorridoId', 'recorridoId')
      db.createObjectStore('cola', { keyPath: 'recorridoId' })
    },
  })
  return conexion
}

/** Cierra y olvida la conexión memoizada (solo se usa en tests). */
export async function cerrarDb(): Promise<void> {
  if (!conexion) return
  const db = await conexion
  db.close()
  conexion = null
}

export async function guardarRecorrido(recorrido: RecorridoLocal): Promise<void> {
  const db = await abrirDb()
  await db.put('recorridos', recorrido)
}

export async function obtenerRecorrido(id: string): Promise<RecorridoLocal | undefined> {
  const db = await abrirDb()
  return db.get('recorridos', id)
}

/** Recorrido que quedó abierto de una sesión anterior (la app se cerró en medio). */
export async function recorridoEnCurso(): Promise<RecorridoLocal | undefined> {
  const db = await abrirDb()
  const todos = await db.getAll('recorridos')
  return todos.find((r) => r.estado === 'en_curso')
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
