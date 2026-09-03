import { kmDeTrack } from '@/lib/track'
import { encolar, guardarRecorrido, listarPuntos, obtenerRecorrido } from './db'

const DECIMALES_KM = 3

/**
 * Cierra un recorrido guardado en el dispositivo: recalcula km y puntos desde
 * lo persistido, lo marca `finalizado` y lo encola para subir. Devuelve false
 * si el recorrido ya no está en la base local.
 */
export async function cerrarRecorrido(recorridoId: string, fin = Date.now()): Promise<boolean> {
  const recorrido = await obtenerRecorrido(recorridoId)
  if (!recorrido) return false

  const puntos = await listarPuntos(recorridoId)
  await guardarRecorrido({
    ...recorrido,
    fin: new Date(fin).toISOString(),
    estado: 'finalizado',
    puntosGps: puntos.length,
    km: Number(kmDeTrack(puntos).toFixed(DECIMALES_KM)),
  })
  await encolar(recorridoId)
  return true
}
