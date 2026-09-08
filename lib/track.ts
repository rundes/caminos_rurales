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

/**
 * Douglas-Peucker con pila explícita: un track de miles de puntos casi
 * colineales puede generar una recursión tan profunda como la cantidad de
 * puntos (el peor caso del algoritmo parte casi siempre un extremo del rango),
 * y eso desborda la pila de llamadas. Acá la "pila" es un array común: cada
 * rango pendiente de evaluar es un elemento, y el bucle sigue hasta vaciarlo.
 *
 * El orden de recorrido no importa para qué puntos se conservan (eso lo
 * decide únicamente la distancia contra la tolerancia en cada rango), pero sí
 * para el orden final del array: como la versión recursiva conserva siempre
 * el orden de índices (recorre izquierda, agrega el pivote, recorre derecha),
 * acá se junten los índices conservados y se ordenan al final para dar
 * exactamente el mismo resultado.
 */
function simplificarRango(
  puntos: readonly PuntoGps[],
  inicio: number,
  fin: number,
  toleranciaM: number,
  salida: PuntoGps[],
): void {
  const pendientes: [number, number][] = [[inicio, fin]]
  const conservados: number[] = []

  while (pendientes.length > 0) {
    const [desde, hasta] = pendientes.pop() as [number, number]
    let indiceMasLejano = -1
    let distanciaMaxima = -1
    for (let i = desde + 1; i < hasta; i += 1) {
      const d = distanciaPerpendicularM(puntos[desde], puntos[hasta], puntos[i])
      if (d > distanciaMaxima) {
        distanciaMaxima = d
        indiceMasLejano = i
      }
    }
    if (distanciaMaxima > toleranciaM && indiceMasLejano !== -1) {
      conservados.push(indiceMasLejano)
      pendientes.push([desde, indiceMasLejano])
      pendientes.push([indiceMasLejano, hasta])
    }
  }

  conservados.sort((a, b) => a - b)
  for (const indice of conservados) salida.push(puntos[indice])
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

/**
 * Parte un track en segmentos según los índices de corte (0-based, cada uno
 * marca dónde arranca un segmento nuevo). Se usa para no dibujar una línea
 * recta entre el último punto antes de una pausa y el primero después de
 * reanudar. Índices fuera de rango o desordenados se ignoran; segmentos
 * vacíos no se incluyen.
 */
export function partirEnSegmentos<T>(puntos: readonly T[], cortes: readonly number[]): T[][] {
  if (puntos.length === 0) return []
  const limites = [...new Set(cortes)]
    .filter((i) => i > 0 && i < puntos.length)
    .sort((a, b) => a - b)

  const segmentos: T[][] = []
  let desde = 0
  for (const corte of limites) {
    segmentos.push(puntos.slice(desde, corte) as T[])
    desde = corte
  }
  segmentos.push(puntos.slice(desde) as T[])
  return segmentos.filter((s) => s.length > 0)
}

/**
 * Umbral de "sin señal" para tratar un hueco entre dos puntos consecutivos
 * como una interrupción real de la grabación (app en 2° plano, pantalla
 * bloqueada, o zona sin GPS) y no como una demora normal de una lectura.
 * `useGrabadorGps.OPCIONES_GPS.timeout` ya le da 20 s a cada lectura antes de
 * que `watchPosition` reporte un error de timeout (y siga reintentando); 30 s
 * deja un margen de 10 s por encima de eso para no marcar como interrupción
 * una única lectura lenta pero real, y es corto en relación a la duración
 * típica de un recorrido para no dejar pasar huecos grandes sin cortar.
 *
 * Es también el umbral que usa el servidor para derivar los cortes del track
 * a partir de los timestamps de los puntos crudos (`derivarCortes`): no
 * confía en los cortes que pudiera declarar el cliente, los recalcula él
 * mismo con este mismo umbral, así hay una sola definición de "corte" en vez
 * de dos que puedan desalinearse.
 */
export const UMBRAL_INTERRUPCION_MS = 30_000

/**
 * Deriva los índices de corte de un track a partir del tiempo entre puntos
 * consecutivos: un hueco mayor a `umbralMs` es una interrupción real (no se
 * grabó nada mientras tanto), así que el punto siguiente arranca un segmento
 * nuevo (mismo formato que espera `partirEnSegmentos`/`kmDeTrack`). Puntos
 * fuera de orden (`t` no creciente) no generan corte: la resta da negativa o
 * cero, nunca supera el umbral.
 */
export function derivarCortes(
  puntos: readonly { t: number }[],
  umbralMs: number = UMBRAL_INTERRUPCION_MS,
): number[] {
  const cortes: number[] = []
  for (let i = 1; i < puntos.length; i += 1) {
    if (puntos[i].t - puntos[i - 1].t > umbralMs) cortes.push(i)
  }
  return cortes
}

/** Suma de distancias haversine entre puntos consecutivos de un segmento, en km. */
function kmDeSegmento(puntos: readonly { lat: number; lng: number }[]): number {
  let km = 0
  for (let i = 1; i < puntos.length; i += 1) {
    km += distanciaKm(puntos[i - 1], puntos[i])
  }
  return km
}

/**
 * Suma de distancias haversine entre puntos consecutivos del track, en km.
 * Con `cortes` (índices, ver `partirEnSegmentos`) no cruza un corte: la
 * distancia entre el último punto de un segmento y el primero del siguiente
 * no se suma, así una pausa o interrupción de la grabación no se acredita
 * como si se hubiera recorrido en línea recta. Sin `cortes` (el valor por
 * defecto) suma el track de punta a punta, igual que antes — es lo que
 * corresponde para una geometría que nunca tiene pausas, como un tramo
 * dibujado a mano (`lib/tramos.ts`, `TramoForm`).
 */
export function kmDeTrack(
  puntos: readonly { lat: number; lng: number }[],
  cortes: readonly number[] = [],
): number {
  if (cortes.length === 0) return kmDeSegmento(puntos)
  return partirEnSegmentos(puntos, cortes).reduce((suma, segmento) => suma + kmDeSegmento(segmento), 0)
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
