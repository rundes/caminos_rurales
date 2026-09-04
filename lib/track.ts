import { distanciaKm } from './geo'

export type PuntoGps = { lat: number; lng: number; t: number; precision: number }

type OpcionesFiltro = { precisionMax: number; distanciaMinM: number }

const OPCIONES_FILTRO_DEFECTO: OpcionesFiltro = { precisionMax: 50, distanciaMinM: 5 }

/** Metros por grado de latitud, consistente con el radio esférico usado en `geo.ts`. */
const METROS_POR_GRADO = (Math.PI / 180) * 6371 * 1000

/**
 * Decide si un punto GPS nuevo debe incorporarse al track: descarta lecturas
 * de baja precisión y puntos demasiado cercanos al último punto aceptado.
 */
export function filtrarPunto(
  ultimo: PuntoGps | null,
  nuevo: PuntoGps,
  opciones: OpcionesFiltro = OPCIONES_FILTRO_DEFECTO,
): boolean {
  if (nuevo.precision > opciones.precisionMax) return false
  if (ultimo) {
    const distanciaM = distanciaKm(ultimo, nuevo) * 1000
    if (distanciaM < opciones.distanciaMinM) return false
  }
  return true
}

function proyectarMetros(p: { lat: number; lng: number }, latRefGrados: number): { x: number; y: number } {
  const latRefRad = (latRefGrados * Math.PI) / 180
  return {
    x: p.lng * Math.cos(latRefRad) * METROS_POR_GRADO,
    y: p.lat * METROS_POR_GRADO,
  }
}

/** Distancia perpendicular aproximada (equirectangular) de `p` a la recta `a`-`b`, en metros. */
function distanciaPerpendicularM(a: PuntoGps, b: PuntoGps, p: PuntoGps): number {
  const latRef = (a.lat + b.lat) / 2
  const A = proyectarMetros(a, latRef)
  const B = proyectarMetros(b, latRef)
  const P = proyectarMetros(p, latRef)
  const dx = B.x - A.x
  const dy = B.y - A.y
  const largo = Math.hypot(dx, dy)
  if (largo === 0) return Math.hypot(P.x - A.x, P.y - A.y)
  return Math.abs(dy * (P.x - A.x) - dx * (P.y - A.y)) / largo
}

function simplificarRango(
  puntos: readonly PuntoGps[],
  inicio: number,
  fin: number,
  toleranciaM: number,
  salida: PuntoGps[],
): void {
  let indiceMasLejano = -1
  let distanciaMaxima = -1
  for (let i = inicio + 1; i < fin; i += 1) {
    const d = distanciaPerpendicularM(puntos[inicio], puntos[fin], puntos[i])
    if (d > distanciaMaxima) {
      distanciaMaxima = d
      indiceMasLejano = i
    }
  }
  if (distanciaMaxima > toleranciaM && indiceMasLejano !== -1) {
    simplificarRango(puntos, inicio, indiceMasLejano, toleranciaM, salida)
    salida.push(puntos[indiceMasLejano])
    simplificarRango(puntos, indiceMasLejano, fin, toleranciaM, salida)
  }
}

/**
 * Simplifica un track con Douglas-Peucker, usando distancia perpendicular
 * en metros (aproximación equirectangular con cos(lat)). Conserva siempre
 * el primer y el último punto.
 */
export function simplificar(puntos: readonly PuntoGps[], toleranciaM = 10): PuntoGps[] {
  if (puntos.length <= 2) return puntos.slice()
  const salida: PuntoGps[] = [puntos[0]]
  simplificarRango(puntos, 0, puntos.length - 1, toleranciaM, salida)
  salida.push(puntos[puntos.length - 1])
  return salida
}

/** Suma de distancias haversine entre puntos consecutivos del track, en km. */
export function kmDeTrack(puntos: readonly { lat: number; lng: number }[]): number {
  let km = 0
  for (let i = 1; i < puntos.length; i += 1) {
    km += distanciaKm(puntos[i - 1], puntos[i])
  }
  return km
}

const MS_POR_HORA = 3600 * 1000

/**
 * Velocidad media de un recorrido en km/h. Si la duración es nula o negativa
 * devuelve `Infinity` cuando hubo desplazamiento (imposible) y 0 si no lo hubo.
 */
export function velocidadMediaKmh(km: number, inicio: Date, fin: Date): number {
  const horas = (fin.getTime() - inicio.getTime()) / MS_POR_HORA
  if (!(horas > 0)) return km > 0 ? Infinity : 0
  return km / horas
}

/** Duración mínima de un segmento para que su velocidad sea significativa. */
const DT_MINIMO_MS = 1000

/**
 * Velocidad máxima entre puntos consecutivos, en km/h. Ignora los segmentos
 * de menos de 1 s: con esa resolución el ruido del GPS domina la medición.
 */
export function velocidadMaximaKmh(
  puntos: readonly { lat: number; lng: number; t: number }[],
): number {
  let maxima = 0
  for (let i = 1; i < puntos.length; i += 1) {
    const dt = puntos[i].t - puntos[i - 1].t
    if (dt < DT_MINIMO_MS) continue
    const velocidad = distanciaKm(puntos[i - 1], puntos[i]) / (dt / MS_POR_HORA)
    if (velocidad > maxima) maxima = velocidad
  }
  return maxima
}

export type LimitesPlausibilidad = {
  /** km/h de velocidad media tolerados en un recorrido. */
  velocidadMediaMax: number
  /** km/h de velocidad puntual entre dos muestras consecutivas. */
  velocidadMaximaMax: number
  /** Metros de precisión media aceptables (por encima, el GPS no es confiable). */
  precisionMediaMax: number
  /** Techo de kilómetros de un único recorrido. */
  kmMaxPorRecorrido: number
}

export const LIMITES_PLAUSIBILIDAD: LimitesPlausibilidad = {
  velocidadMediaMax: 120,
  velocidadMaximaMax: 160,
  precisionMediaMax: 60,
  kmMaxPorRecorrido: 400,
}

export type EntradaPlausibilidad = {
  km: number
  inicio: Date
  fin: Date
  puntos?: readonly { lat: number; lng: number; t: number; precision?: number }[]
  /** Precisión media en metros; si falta se calcula desde `puntos`. */
  precisionMedia?: number
}

function precisionMediaDe(entrada: EntradaPlausibilidad): number | undefined {
  if (entrada.precisionMedia !== undefined) return entrada.precisionMedia
  const precisiones = (entrada.puntos ?? [])
    .map((p) => p.precision)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p))
  if (precisiones.length === 0) return undefined
  return precisiones.reduce((suma, p) => suma + p, 0) / precisiones.length
}

/**
 * Antitrampa: descarta recorridos físicamente imposibles (velocidades de auto
 * de carrera o de avión, distancias desmedidas) o con un GPS tan impreciso que
 * la cobertura calculada no sería confiable. Devuelve todos los motivos.
 */
export function evaluarPlausibilidad(
  entrada: EntradaPlausibilidad,
  limites: LimitesPlausibilidad = LIMITES_PLAUSIBILIDAD,
): { ok: boolean; motivos: string[] } {
  const motivos: string[] = []

  if (!Number.isFinite(entrada.km) || entrada.km < 0) {
    motivos.push('km inválidos')
  } else if (entrada.km > limites.kmMaxPorRecorrido) {
    motivos.push(`km fuera de rango: ${entrada.km.toFixed(1)} > ${limites.kmMaxPorRecorrido}`)
  }

  const media = velocidadMediaKmh(entrada.km, entrada.inicio, entrada.fin)
  if (!Number.isFinite(media) || media > limites.velocidadMediaMax) {
    motivos.push(`velocidad media fuera de rango: ${media.toFixed(1)} > ${limites.velocidadMediaMax} km/h`)
  }

  if (entrada.puntos && entrada.puntos.length > 1) {
    const maxima = velocidadMaximaKmh(entrada.puntos)
    if (maxima > limites.velocidadMaximaMax) {
      motivos.push(`velocidad máxima fuera de rango: ${maxima.toFixed(1)} > ${limites.velocidadMaximaMax} km/h`)
    }
  }

  const precision = precisionMediaDe(entrada)
  if (precision !== undefined && precision > limites.precisionMediaMax) {
    motivos.push(`precisión media insuficiente: ${precision.toFixed(1)} m > ${limites.precisionMediaMax} m`)
  }

  return { ok: motivos.length === 0, motivos }
}
