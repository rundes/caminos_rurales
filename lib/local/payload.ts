import type { Impacto, MuestraSensor } from '@/lib/sensores/tipos'
import { MAX_IMPACTOS, MAX_MUESTRAS } from '@/lib/sensores/umbrales'
import { simplificar, type PuntoGps } from '@/lib/track'
import type { Observacion, PuntoCadenciaPayload, PuntoGpsPayload, RecorridoPayload } from '@/lib/validaciones'
import type { DepsSincronizacion } from './deps'
import type { ImpactoLocal, MuestraLocal, ObservacionLocal, RecorridoLocal } from './tipos'

export const TOLERANCIA_SIMPLIFICADO_M = 10
/** Tope de puntos en el payload, igual al máximo aceptado por `esquemaRecorrido`. */
export const MAX_PUNTOS_PAYLOAD = 20000
/** Topes de sensores en el payload, iguales a los de `esquemaRecorrido`. */
export const MAX_MUESTRAS_PAYLOAD = MAX_MUESTRAS
export const MAX_IMPACTOS_PAYLOAD = MAX_IMPACTOS

/**
 * Intervalo objetivo entre entradas de la cadencia (ver `armarCadencia`):
 * elegido para quedar bien por debajo de `UMBRAL_INTERRUPCION_MS` (30 s,
 * `lib/track.ts`) con margen de sobra — así una interrupción real siempre
 * deja al menos un hueco entre entradas de cadencia por encima del umbral,
 * nunca lo esconde por casualidad de dónde cayó el muestreo — y lo bastante
 * grande como para que el array siga siendo barato: un recorrido de 1 h
 * produce 720 entradas (3600 s / 5 s), del mismo orden que `track`/`puntos`
 * ya simplificados. Es también el mismo cadencia que usan las muestras de
 * sensores (5 s, ver `lib/sensores/umbrales.ts`), así que no es un número
 * nuevo en el codebase.
 */
export const INTERVALO_CADENCIA_MS = 5_000
/** Tope de puntos de la cadencia en el payload, igual al máximo de `esquemaRecorrido`. */
export const MAX_PUNTOS_CADENCIA_PAYLOAD = 20000

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

function muestrearPorTiempo(crudos: readonly PuntoGps[], intervaloMs: number): PuntoCadenciaPayload[] {
  const salida: PuntoCadenciaPayload[] = [{ lat: crudos[0].lat, lng: crudos[0].lng, t: crudos[0].t }]
  let proximo = crudos[0].t + intervaloMs
  for (let i = 1; i < crudos.length; i += 1) {
    if (crudos[i].t >= proximo) {
      salida.push({ lat: crudos[i].lat, lng: crudos[i].lng, t: crudos[i].t })
      proximo = crudos[i].t + intervaloMs
    }
  }
  const ultimo = crudos[crudos.length - 1]
  if (salida[salida.length - 1].t !== ultimo.t) salida.push({ lat: ultimo.lat, lng: ultimo.lng, t: ultimo.t })
  return salida
}

/**
 * Arma la cadencia real de fixes: una entrada por cada `intervaloMs` de
 * tiempo real transcurrido, tomada de `crudos` (los puntos GPS *antes* de
 * `simplificar`/Douglas-Peucker) para que el servidor pueda derivar
 * interrupciones de la cadencia real de la grabación y no de la geometría ya
 * simplificada (ver `derivarCortesDeCadencia` en `lib/track.ts`). Conserva
 * siempre el primer y el último punto crudo, así los límites de la cadencia
 * coinciden con `inicio`/`fin` dentro del margen que exige el `.refine` de
 * `esquemaRecorrido`.
 *
 * A diferencia de `track`/`puntos` (que muestrean por *cantidad* de vértices
 * que sobreviven a Douglas-Peucker), acá se muestrea por *tiempo*: es lo que
 * garantiza que, mientras hubo grabación real, nunca hay un hueco entre dos
 * entradas consecutivas mayor al intervalo efectivo — la propiedad que
 * necesita `derivarCortesDeCadencia` para tratar cualquier hueco más grande
 * como una interrupción real.
 *
 * Si `intervaloMs` produciría más de `tope` entradas (un recorrido de más de
 * ~27,7 h a 5 s, ver `MAX_PUNTOS_CADENCIA_PAYLOAD`) se agranda el intervalo
 * lo justo para entrar en el tope, en vez de recortar el array después: un
 * downsampleo posterior por cantidad (como el que usa `armarPayload` para
 * `track`/`muestras`/`impactos`) rompería la garantía de "nunca más de
 * `intervaloMs` entre entradas consecutivas" en el punto exacto del corte —
 * y esa garantía es lo único que hace confiable a `derivarCortesDeCadencia`.
 */
function armarCadencia(
  crudos: readonly PuntoGps[],
  intervaloMs: number,
  tope: number = MAX_PUNTOS_CADENCIA_PAYLOAD,
): PuntoCadenciaPayload[] {
  if (crudos.length === 0) return []
  const duracionMs = crudos[crudos.length - 1].t - crudos[0].t
  const intervaloEfectivo =
    duracionMs > 0 ? Math.max(intervaloMs, Math.ceil(duracionMs / Math.max(tope - 1, 1))) : intervaloMs
  return muestrearPorTiempo(crudos, intervaloEfectivo)
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
  const cadencia = armarCadencia(puntos as PuntoGps[], INTERVALO_CADENCIA_MS)

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
    cadencia,
    observaciones: observaciones.map(aObservacionPayload),
    ...(muestras.length > 0
      ? { muestras: downsamplear(muestras, MAX_MUESTRAS_PAYLOAD).map(aMuestraPayload) }
      : {}),
    ...(impactos.length > 0
      ? { impactos: downsamplear(impactos, MAX_IMPACTOS_PAYLOAD).map(aImpactoPayload) }
      : {}),
  }
}
