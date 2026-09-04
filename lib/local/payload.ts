import type { Impacto, MuestraSensor } from '@/lib/sensores/tipos'
import { MAX_IMPACTOS, MAX_MUESTRAS } from '@/lib/sensores/umbrales'
import { simplificar, type PuntoGps } from '@/lib/track'
import type { Observacion, PuntoGpsPayload, RecorridoPayload } from '@/lib/validaciones'
import type { DepsSincronizacion } from './deps'
import type { ImpactoLocal, MuestraLocal, ObservacionLocal, RecorridoLocal } from './tipos'

export const TOLERANCIA_SIMPLIFICADO_M = 10
/** Tope de puntos en el payload, igual al máximo aceptado por `esquemaRecorrido`. */
export const MAX_PUNTOS_PAYLOAD = 20000
/** Topes de sensores en el payload, iguales a los de `esquemaRecorrido`. */
export const MAX_MUESTRAS_PAYLOAD = MAX_MUESTRAS
export const MAX_IMPACTOS_PAYLOAD = MAX_IMPACTOS

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

/** Saca el `recorridoId` local: el servidor lo toma del recorrido, no de cada fila. */
function aMuestraPayload(muestra: MuestraLocal): MuestraSensor {
  return {
    t: muestra.t,
    lat: muestra.lat,
    lng: muestra.lng,
    velocidadKmh: muestra.velocidadKmh,
    rumbo: muestra.rumbo,
    altitud: muestra.altitud,
    rmsVertical: muestra.rmsVertical,
    picoVertical: muestra.picoVertical,
    frenadas: muestra.frenadas,
    laterales: muestra.laterales,
    muestras: muestra.muestras,
    calidad: muestra.calidad,
  }
}

function aImpactoPayload(impacto: ImpactoLocal): Impacto {
  return {
    t: impacto.t,
    lat: impacto.lat,
    lng: impacto.lng,
    pico: impacto.pico,
    velocidadKmh: impacto.velocidadKmh,
  }
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

  // Los sensores son opcionales: un dispositivo sin acelerómetro (o una base
  // local vieja) sube el recorrido igual, sin muestras ni impactos.
  const muestras = (await deps.db.listarMuestras?.(recorrido.id)) ?? []
  const impactos = (await deps.db.listarImpactos?.(recorrido.id)) ?? []

  return {
    id: recorrido.id,
    inicio: recorrido.inicio,
    fin: recorrido.fin ?? new Date(deps.ahora()).toISOString(),
    puntosGps: puntos.length,
    track,
    puntos: puntosPayload,
    observaciones: observaciones.map(aObservacionPayload),
    ...(muestras.length > 0
      ? { muestras: downsamplear(muestras, MAX_MUESTRAS_PAYLOAD).map(aMuestraPayload) }
      : {}),
    ...(impactos.length > 0
      ? { impactos: downsamplear(impactos, MAX_IMPACTOS_PAYLOAD).map(aImpactoPayload) }
      : {}),
  }
}
