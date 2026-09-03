import { rutaEvidencia, validarArchivo } from './archivos'
import type { ResultadoAccion } from './tipos'

export const BUCKET_EVIDENCIA = 'evidencia-vial'
export const RUTA_PROCESAR_IA = '/api/procesar-ia'

export type EstadoSubida = 'pendiente' | 'subiendo' | 'ok' | 'error' | 'invalido'

export type ArchivoEnLista = {
  id: string
  archivo: File
  estado: EstadoSubida
  mensaje?: string
  ruta?: string
}

type ResultadoUpload = { error: { message: string } | null }

export type ClienteStorage = {
  storage: {
    from: (bucket: string) => { upload: (ruta: string, archivo: File) => Promise<ResultadoUpload> }
  }
}

export const ETIQUETA_ESTADO: Record<EstadoSubida, string> = {
  pendiente: 'Pendiente',
  subiendo: 'Subiendo…',
  ok: 'Listo',
  error: 'Error',
  invalido: 'No válido',
}

let contadorIds = 0

/** Id estable por archivo. `crypto.randomUUID` cuando existe, contador incremental si no. */
export function nuevoIdArchivo(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  contadorIds += 1
  return `archivo-${contadorIds}`
}

export function crearItem(archivo: File): ArchivoEnLista {
  const invalido = validarArchivo(archivo)
  const id = nuevoIdArchivo()
  return invalido ? { id, archivo, estado: 'invalido', mensaje: invalido } : { id, archivo, estado: 'pendiente' }
}

export function pendienteDeSubida(item: ArchivoEnLista): boolean {
  return item.estado === 'pendiente' || item.estado === 'error'
}

export function rutasSubidas(items: readonly ArchivoEnLista[]): string[] {
  return items.flatMap((item) => (item.estado === 'ok' && item.ruta ? [item.ruta] : []))
}

/**
 * Sube únicamente los archivos pendientes o que fallaron antes.
 * Notifica cada cambio por `alActualizar` y devuelve la lista final sin mutar la original.
 */
export async function subirPendientes(
  cliente: ClienteStorage,
  uid: string,
  relevamientoId: string,
  items: readonly ArchivoEnLista[],
  alActualizar: (id: string, parche: Partial<ArchivoEnLista>) => void,
): Promise<ArchivoEnLista[]> {
  const bucket = cliente.storage.from(BUCKET_EVIDENCIA)
  let finales: ArchivoEnLista[] = [...items]

  for (const item of items) {
    if (!pendienteDeSubida(item)) continue

    alActualizar(item.id, { estado: 'subiendo', mensaje: undefined })
    const ruta = rutaEvidencia(uid, relevamientoId, item.archivo.name)
    const { error } = await bucket.upload(ruta, item.archivo)
    if (error) console.error('[subida]', error.message)
    const parche: Partial<ArchivoEnLista> = error
      ? { estado: 'error', mensaje: 'No se pudo subir. Reintentá.' }
      : { estado: 'ok', ruta, mensaje: undefined }

    alActualizar(item.id, parche)
    finales = finales.map((actual) => (actual.id === item.id ? { ...actual, ...parche } : actual))
  }

  return finales
}

export function aplicarParche(
  items: readonly ArchivoEnLista[],
  id: string,
  parche: Partial<ArchivoEnLista>,
): ArchivoEnLista[] {
  return items.map((item) => (item.id === id ? { ...item, ...parche } : item))
}

/**
 * Un 409 de `/api/procesar-ia` significa "ya fue procesado" (por este mismo pedido o uno
 * concurrente): no es un error para el usuario, es un resultado exitoso sin fallas nuevas.
 */
export type ResultadoProcesamiento = { fallas: number } | { fallas: null; yaProcesado: true }

export async function procesarRelevamiento(
  relevamientoId: string,
  fetcher: typeof fetch = fetch,
): Promise<ResultadoAccion<ResultadoProcesamiento>> {
  try {
    const respuesta = await fetcher(RUTA_PROCESAR_IA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relevamiento_id: relevamientoId }),
    })
    if (respuesta.status === 409) {
      return { ok: true, data: { fallas: null, yaProcesado: true } }
    }
    const cuerpo = (await respuesta.json()) as { ok?: boolean; fallas?: number; error?: string }
    if (!respuesta.ok || !cuerpo.ok) {
      return { ok: false, error: cuerpo.error ?? `Error ${respuesta.status} al procesar` }
    }
    return { ok: true, data: { fallas: cuerpo.fallas ?? 0 } }
  } catch (error) {
    console.error('[cargar-viaje]', error)
    return { ok: false, error: 'No se pudo procesar la evidencia. Intentá de nuevo.' }
  }
}
