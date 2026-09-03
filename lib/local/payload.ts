import { simplificar, type PuntoGps } from '@/lib/track'
import type { Observacion, PuntoGpsPayload, RecorridoPayload } from '@/lib/validaciones'
import type { DepsSincronizacion } from './deps'
import type { ObservacionLocal, RecorridoLocal } from './tipos'

export const TOLERANCIA_SIMPLIFICADO_M = 10
/** Tope de puntos en el payload, igual al máximo aceptado por `esquemaRecorrido`. */
export const MAX_PUNTOS_PAYLOAD = 20000

export const ERROR_SIN_TRACK = 'El recorrido no tiene puntos suficientes para subirse.'

function aObservacionPayload(observacion: ObservacionLocal): Observacion {
  return {
    id: observacion.id,
    tipo_falla: observacion.tipo_falla,
    severidad: observacion.severidad,
    latitud: observacion.latitud,
    longitud: observacion.longitud,
    ...(observacion.descripcion ? { descripcion: observacion.descripcion } : {}),
    ...(observacion.evidencia ? { evidencia: observacion.evidencia } : {}),
  }
}

/**
 * Reduce `puntos` a lo sumo `tope` elementos tomando uno cada `stride`
 * posiciones, preservando siempre el primer y el último punto.
 */
function downsamplear<T>(puntos: readonly T[], tope: number): T[] {
  if (puntos.length <= tope) return puntos.slice()

  const stride = Math.ceil(puntos.length / tope)
  const salida: T[] = []
  for (let i = 0; i < puntos.length; i += stride) {
    salida.push(puntos[i])
  }
  const ultimo = puntos[puntos.length - 1]
  if (salida[salida.length - 1] !== ultimo) salida.push(ultimo)
  return salida
}

/** Arma el cuerpo que espera `finalizarRecorrido` desde lo guardado en el dispositivo. */
export async function armarPayload(
  recorrido: RecorridoLocal,
  observaciones: readonly ObservacionLocal[],
  deps: DepsSincronizacion,
): Promise<RecorridoPayload> {
  const puntos = await deps.db.listarPuntos(recorrido.id)
  if (puntos.length < 2) throw new Error(ERROR_SIN_TRACK)

  const simplificado = downsamplear(
    simplificar(puntos as PuntoGps[], TOLERANCIA_SIMPLIFICADO_M),
    MAX_PUNTOS_PAYLOAD,
  )
  const track = simplificado.map((p): [number, number] => [p.lat, p.lng])
  const puntosPayload: PuntoGpsPayload[] = simplificado.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    t: p.t,
    precision: p.precision,
  }))

  return {
    id: recorrido.id,
    inicio: recorrido.inicio,
    fin: recorrido.fin ?? new Date(deps.ahora()).toISOString(),
    puntosGps: puntos.length,
    track,
    puntos: puntosPayload,
    observaciones: observaciones.map(aObservacionPayload),
  }
}
