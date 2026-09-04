import { kmDeTrack } from '@/lib/track'
import { abrirDb } from './db'
import type { RecorridoLocal } from './tipos'

const DECIMALES_KM = 3
/** Un track necesita al menos dos puntos para tener longitud. */
export const MIN_PUNTOS = 2

export const MENSAJE_DESCARTADO = 'Recorrido sin puntos GPS, descartado.'
const MENSAJE_SIN_RECORRIDO = 'No se encontró el recorrido guardado en el dispositivo.'

export type ResultadoCierre =
  | { ok: true; recorrido: RecorridoLocal }
  | { ok: false; motivo: 'sin_recorrido' | 'descartado'; mensaje: string }

/**
 * Cierra un recorrido guardado en el dispositivo: recalcula km y puntos desde
 * lo persistido, lo marca `finalizado` y lo encola para subir, todo en una
 * única transacción sobre `recorridos` + `cola` (así nunca queda un recorrido
 * finalizado sin item de cola, ni al revés).
 *
 * Si el track tiene menos de dos puntos no hay nada que subir: el recorrido se
 * marca `descartado` y no se encola.
 */
export async function cerrarRecorrido(recorridoId: string, fin = Date.now()): Promise<ResultadoCierre> {
  const db = await abrirDb()
  const puntos = await db.getAllFromIndex('puntos', 'recorridoId', recorridoId)

  const tx = db.transaction(['recorridos', 'cola'], 'readwrite')
  const recorridos = tx.objectStore('recorridos')
  const guardado = await recorridos.get(recorridoId)
  if (!guardado) {
    await tx.done
    return { ok: false, motivo: 'sin_recorrido', mensaje: MENSAJE_SIN_RECORRIDO }
  }

  const suficientes = puntos.length >= MIN_PUNTOS
  const recorrido: RecorridoLocal = {
    ...guardado,
    fin: new Date(fin).toISOString(),
    estado: suficientes ? 'finalizado' : 'descartado',
    puntosGps: puntos.length,
    km: suficientes ? Number(kmDeTrack(puntos).toFixed(DECIMALES_KM)) : 0,
  }
  await recorridos.put(recorrido)

  if (suficientes) {
    const cola = tx.objectStore('cola')
    // Si ya estaba encolado no se reinician sus intentos.
    if (!(await cola.get(recorridoId))) {
      await cola.put({ recorridoId, intentos: 0, proximoIntento: 0 })
    }
  }
  await tx.done

  if (!suficientes) return { ok: false, motivo: 'descartado', mensaje: MENSAJE_DESCARTADO }
  return { ok: true, recorrido }
}
