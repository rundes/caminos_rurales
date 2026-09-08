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

/**
 * Deriva los índices de corte de un track a partir de la velocidad implícita
 * entre puntos consecutivos: si la distancia recorrida no es alcanzable en
 * el tiempo transcurrido a una velocidad físicamente plausible, hay una
 * interrupción real entre medio (aunque el hueco de tiempo por sí solo no
 * supere `UMBRAL_INTERRUPCION_MS` — un salto corto en el reloj pero enorme
 * en el espacio también delata una pausa, o un intento de esconderla).
 *
 * A diferencia de un umbral de distancia fijo (la versión anterior de esta
 * función), esto nunca corta de más un tramo recto real por más
 * compresible que sea con Douglas-Peucker: un camino recto real recorrido a
 * velocidad normal tarda más cuanto más largo es, así que dos vértices
 * sobrevivientes muy separados en el espacio también están separados en el
 * tiempo, y la velocidad implícita entre ellos se mantiene baja (ver el test
 * de un tramo recto de 20 km en `track.test.ts`). Lo que sí corta es que la
 * distancia crezca sin que el tiempo transcurrido lo justifique — exactamente
 * lo que separa una pausa real (o una fabricada) de un tramo recto genuino.
 *
 * Reutiliza `LIMITES_PLAUSIBILIDAD.velocidadMaximaMax`, el mismo límite que
 * ya usa `evaluarPlausibilidad`/`velocidadMaximaKmh` para rechazar un
 * recorrido entero: una sola definición de "velocidad físicamente imposible"
 * en todo el archivo, no dos que puedan desalinearse.
 *
 * Fail-closed ante timestamps fuera de orden o comprimidos a cero: un
 * desplazamiento real no puede tomar un tiempo nulo o negativo, así que ese
 * caso se trata como velocidad infinita (corta) en vez de ignorarse — de lo
 * contrario, comprimir dos timestamps al mismo instante esquivaría esta
 * señal por completo (aunque no la vuelve indetectable: sigue siendo un
 * salto de posición sin tiempo transcurrido, y `evaluarPlausibilidad` lo
 * rechaza igual si termina acreditándose sin cortar). Sin desplazamiento
 * (`distanciaM` ~0) un tiempo nulo o negativo no corta: no hay nada que
 * evaluar.
 */
export function derivarCortesPorVelocidad(
  puntos: readonly { lat: number; lng: number; t: number }[],
  velocidadMaxKmh: number = LIMITES_PLAUSIBILIDAD.velocidadMaximaMax,
): number[] {
  const cortes: number[] = []
  for (let i = 1; i < puntos.length; i += 1) {
    const dtMs = puntos[i].t - puntos[i - 1].t
    const distanciaM = distanciaKm(puntos[i - 1], puntos[i]) * 1000
    if (dtMs <= 0) {
      if (distanciaM > 0) cortes.push(i)
      continue
    }
    const velocidadKmh = (distanciaM / 1000) / (dtMs / MS_POR_HORA)
    if (velocidadKmh > velocidadMaxKmh) cortes.push(i)
  }
  return cortes
}

/**
 * Une varias listas de índices de corte (ver `derivarCortes`/
 * `derivarCortesPorVelocidad`) en una sola, sin duplicados y ordenada —
 * el formato que espera `partirEnSegmentos`/`kmDeTrack`. Cada señal puede
 * fallar por separado (un hueco corto en el reloj con un salto enorme no
 * corta por tiempo, pero sí por velocidad; un hueco largo con un salto chico
 * es al revés), así que lo que cuenta como interrupción real es la unión:
 * alcanza con que una sola señal la detecte.
 */
export function unionCortes(...listas: readonly (readonly number[])[]): number[] {
  const union = new Set<number>()
  for (const lista of listas) {
    for (const indice of lista) union.add(indice)
  }
  return [...union].sort((a, b) => a - b)
}

/**
 * Cortes de un array de muestras que trae su propia posición y su propio
 * timestamp (una muestra de sensores, por ejemplo): combina la señal de
 * tiempo (`derivarCortes`) y la de velocidad implícita
 * (`derivarCortesPorVelocidad`) sobre el mismo array. A diferencia del track
 * del recorrido —donde el timestamp viene en `datos.puntos` y la geometría
 * en `datos.track`, dos arrays que `esquemaRecorrido` obliga a mantener
 * alineados—, acá no hace falta reconciliar nada: cada muestra ya trae las
 * dos señales consigo misma, así que es la misma unión aplicada a un solo
 * array.
 */
export function derivarCortesDeMuestras(
  puntos: readonly { lat: number; lng: number; t: number }[],
  opciones: { umbralMs?: number; velocidadMaxKmh?: number } = {},
): number[] {
  const umbralMs = opciones.umbralMs ?? UMBRAL_INTERRUPCION_MS
  const velocidadMaxKmh = opciones.velocidadMaxKmh ?? LIMITES_PLAUSIBILIDAD.velocidadMaximaMax
  return unionCortes(derivarCortes(puntos, umbralMs), derivarCortesPorVelocidad(puntos, velocidadMaxKmh))
}

/**
 * Primer índice de `puntosTrack` cuyo `t` es mayor o igual a `t` (búsqueda
 * binaria: `puntosTrack` siempre está ordenado por tiempo, es el orden en
 * que lo arma `armarPayload`). `-1` si ni el último punto llega a `t` — el
 * hueco termina después de que el track se acaba, así que no hay nada que
 * cortar de él.
 */
function primerIndiceDesde(puntosTrack: readonly { t: number }[], t: number): number {
  let desde = 0
  let hasta = puntosTrack.length
  while (desde < hasta) {
    const medio = (desde + hasta) >> 1
    if (puntosTrack[medio].t < t) desde = medio + 1
    else hasta = medio
  }
  return desde < puntosTrack.length ? desde : -1
}

/**
 * Deriva los cortes de la cadencia real de fixes (`cadencia`, ver
 * `armarPayload` en `lib/local/payload.ts`) y los mapea a un índice de
 * `puntosTrack` (`datos.puntos`, alineado índice a índice con `datos.track`
 * por el `.refine` de `esquemaRecorrido`).
 *
 * La cadencia es un array aparte, muestreado por tiempo a partir de los
 * puntos GPS crudos (antes de Douglas-Peucker) — a diferencia de `track`/
 * `puntos`, que son el mismo array simplificado con y sin timestamp, y por
 * eso no sirven para detectar un corte por tiempo: un tramo recto real
 * puede colapsar a dos vértices separados por varios kilómetros y varios
 * minutos sin que haya pasado nada (ver el test del tramo recto de 20 km en
 * `track.test.ts`). La cadencia, en cambio, siempre tiene una entrada cada
 * pocos segundos (`INTERVALO_CADENCIA_MS`) mientras hay grabación real, así
 * que un hueco entre dos entradas consecutivas —o una velocidad implícita
 * implausible entre ellas, cortesía de reusar `derivarCortesDeMuestras`— es
 * una interrupción real, exista o no un vértice de `track` justo ahí.
 *
 * Cada corte de la cadencia se ubica en `puntosTrack` por timestamp: el
 * primer punto del track cuyo `t` es mayor o igual al del punto que abre el
 * hueco (`primerIndiceDesde`), no por índice — la cadencia y el track no
 * tienen la misma cantidad de entradas. Un hueco que termina después de que
 * el track ya se acabó no aporta ningún índice (nada que cortar del lado
 * del track).
 */
export function derivarCortesDeCadencia(
  cadencia: readonly { lat: number; lng: number; t: number }[],
  puntosTrack: readonly { t: number }[],
  opciones: { umbralMs?: number; velocidadMaxKmh?: number } = {},
): number[] {
  const cortesCadencia = derivarCortesDeMuestras(cadencia, opciones)
  const cortes: number[] = []
  for (const i of cortesCadencia) {
    const indice = primerIndiceDesde(puntosTrack, cadencia[i].t)
    if (indice !== -1) cortes.push(indice)
  }
  return cortes
}

/**
 * Deriva los cortes finales que usa `finalizarRecorrido` para segmentar el
 * track de un recorrido: la unión de dos señales independientes entre sí (ver
 * `unionCortes`), ninguna de las cuales confía en cortes que declare el
 * cliente:
 * - velocidad implícita directa sobre `puntosTrack` (`derivarCortesPorVelocidad`):
 *   un salto de posición que no es alcanzable en el tiempo transcurrido a una
 *   velocidad físicamente plausible, sin importar cuán corto sea el hueco de
 *   reloj entre esos dos puntos del track;
 * - huecos (o velocidad implausible) de la cadencia real de fixes
 *   (`derivarCortesDeCadencia`), mapeados a un índice de `puntosTrack` por
 *   timestamp: la única señal que puede detectar una pausa real que un tramo
 *   recto simplificado esconde (ver el comentario de `derivarCortesDeCadencia`).
 *
 * Exportada aparte de `finalizarRecorrido` para poder testear la combinación
 * completa (incluida la conversión de índices de la cadencia a índices del
 * track) sin duplicar esta lógica en `__tests__/track.test.ts`.
 */
export function derivarCortesDeTrack(
  puntosTrack: readonly { lat: number; lng: number; t: number }[],
  cadencia: readonly { lat: number; lng: number; t: number }[],
  opciones: { umbralMs?: number; velocidadMaxKmh?: number } = {},
): number[] {
  const cortesVelocidad = derivarCortesPorVelocidad(puntosTrack, opciones.velocidadMaxKmh)
  const cortesCadencia = derivarCortesDeCadencia(cadencia, puntosTrack, opciones)
  return unionCortes(cortesVelocidad, cortesCadencia)
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
