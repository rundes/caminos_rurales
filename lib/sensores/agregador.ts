import { distanciaKm } from '../geo'
import { calidadDeSegmento } from './calidad'
import type { MuestraSensor } from './tipos'
import { SEGMENTO_M, SEGMENTO_MS, UMBRAL_FRENADA, UMBRAL_LATERAL } from './umbrales'

const MS_POR_HORA = 3_600_000
const GRADOS_CIRCULO = 360

/** Lectura GPS ya normalizada que alimenta al agregador. */
export type LecturaGps = {
  lat: number
  lng: number
  velocidadKmh: number
  rumbo: number | null
  altitud: number | null
  t: number
}

/** Evento de movimiento ya proyectado sobre los ejes del vehículo. */
export type EventoMovimiento = {
  /** Aceleración vertical con signo, en m/s². */
  az: number
  /** Aceleración longitudinal (negativa = frenada), en m/s². */
  aLong: number
  /** Aceleración lateral con signo, en m/s². */
  aLat: number
  t: number
}

/**
 * Estado inmutable del segmento abierto. Solo guarda acumuladores: el detalle
 * de cada evento no se conserva (no se suben datos crudos).
 */
export type Agregador = {
  /** Epoch ms en que se abrió el segmento. */
  readonly inicio: number
  readonly sumaCuadrados: number
  readonly pico: number
  readonly muestras: number
  readonly frenadas: number
  readonly laterales: number
  readonly sumaVelocidad: number
  /** Lecturas GPS recibidas dentro del segmento abierto. */
  readonly lecturas: number
  /** Posición en la que se abrió el segmento, para el corte por 100 m. */
  readonly origen: { readonly lat: number; readonly lng: number } | null
  /** Última lectura GPS conocida; sobrevive al cierre de un segmento. */
  readonly ultima: LecturaGps | null
}

export function crearAgregador(ahora: number): Agregador {
  return {
    inicio: ahora,
    sumaCuadrados: 0,
    pico: 0,
    muestras: 0,
    frenadas: 0,
    laterales: 0,
    sumaVelocidad: 0,
    lecturas: 0,
    origen: null,
    ultima: null,
  }
}

/** Suma un evento de movimiento a los acumuladores del segmento abierto. */
export function agregarMovimiento(estado: Agregador, evento: EventoMovimiento): Agregador {
  const az = Number.isFinite(evento.az) ? evento.az : 0
  const absoluto = Math.abs(az)
  return {
    ...estado,
    sumaCuadrados: estado.sumaCuadrados + az * az,
    pico: Math.max(estado.pico, absoluto),
    muestras: estado.muestras + 1,
    frenadas: estado.frenadas + (evento.aLong < UMBRAL_FRENADA ? 1 : 0),
    laterales: estado.laterales + (Math.abs(evento.aLat) > UMBRAL_LATERAL ? 1 : 0),
  }
}

/**
 * Suma una lectura GPS. La primera del segmento fija el origen desde el que se
 * miden los 100 m (si no venía uno heredado del segmento anterior).
 */
export function agregarGps(estado: Agregador, lectura: LecturaGps): Agregador {
  const velocidad = Number.isFinite(lectura.velocidadKmh) ? Math.max(0, lectura.velocidadKmh) : 0
  return {
    ...estado,
    sumaVelocidad: estado.sumaVelocidad + velocidad,
    lecturas: estado.lecturas + 1,
    origen: estado.origen ?? { lat: lectura.lat, lng: lectura.lng },
    ultima: { ...lectura, velocidadKmh: velocidad },
  }
}

/** Un segmento se cierra a los 5 s o a los 100 m recorridos, lo que ocurra primero. */
function debeCerrar(estado: Agregador, ahora: number): boolean {
  if (ahora - estado.inicio >= SEGMENTO_MS) return true
  if (!estado.origen || !estado.ultima) return false
  return distanciaKm(estado.origen, estado.ultima) * 1000 >= SEGMENTO_M
}

/** Abre el segmento siguiente conservando la última posición conocida. */
function reabrir(estado: Agregador, ahora: number): Agregador {
  return {
    ...crearAgregador(ahora),
    origen: estado.ultima ? { lat: estado.ultima.lat, lng: estado.ultima.lng } : null,
    ultima: estado.ultima,
  }
}

/**
 * Cierra el segmento si corresponde y devuelve el estado siguiente junto con
 * el agregado. Sin ninguna posición conocida el segmento se descarta (no hay
 * dónde ubicarlo); con una posición pero sin lecturas ni movimiento en la
 * ventana sale con `calidad = 'sin_dato'`.
 */
export function cerrarSegmentoSiCorresponde(
  estado: Agregador,
  ahora: number,
): { estado: Agregador; segmento: MuestraSensor | null } {
  if (!debeCerrar(estado, ahora)) return { estado, segmento: null }

  const siguiente = reabrir(estado, ahora)
  const ultima = estado.ultima
  if (!ultima) return { estado: siguiente, segmento: null }

  const velocidadKmh = estado.lecturas > 0 ? estado.sumaVelocidad / estado.lecturas : 0
  const rmsVertical = estado.muestras > 0 ? Math.sqrt(estado.sumaCuadrados / estado.muestras) : 0
  const conDatos = estado.muestras > 0 && estado.lecturas > 0

  return {
    estado: siguiente,
    segmento: {
      t: ahora,
      lat: ultima.lat,
      lng: ultima.lng,
      velocidadKmh,
      rumbo: ultima.rumbo,
      altitud: ultima.altitud,
      rmsVertical,
      picoVertical: estado.pico,
      frenadas: estado.frenadas,
      laterales: estado.laterales,
      muestras: estado.muestras,
      calidad: conDatos ? calidadDeSegmento(rmsVertical, velocidadKmh) : 'sin_dato',
    },
  }
}

function normalizarRumbo(grados: number): number {
  return ((grados % GRADOS_CIRCULO) + GRADOS_CIRCULO) % GRADOS_CIRCULO
}

/** Rumbo inicial en grados desde `a` hacia `b`, medido desde el norte. */
function rumboEntre(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const radianes = Math.PI / 180
  const dLng = (b.lng - a.lng) * radianes
  const latA = a.lat * radianes
  const latB = b.lat * radianes
  const y = Math.sin(dLng) * Math.cos(latB)
  const x = Math.cos(latA) * Math.sin(latB) - Math.sin(latA) * Math.cos(latB) * Math.cos(dLng)
  return normalizarRumbo((Math.atan2(y, x) * 180) / Math.PI)
}

function finito(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

type CoordenadasNavegador = {
  speed?: number | null
  heading?: number | null
  altitude?: number | null
}

/**
 * Arma la lectura que consume el agregador desde un punto GPS aceptado.
 * Prefiere la velocidad, el rumbo y la altitud que informa el navegador (el
 * GPS los mide mejor que una diferencia entre puntos); si faltan, deriva
 * velocidad y rumbo del punto anterior y deja la altitud sin dato.
 */
export function lecturaDesdePunto(
  anterior: { lat: number; lng: number; t: number } | null,
  punto: { lat: number; lng: number; t: number },
  coordenadas?: CoordenadasNavegador | null,
): LecturaGps {
  const velocidadMs = finito(coordenadas?.speed)
  const dt = anterior ? punto.t - anterior.t : 0
  const derivada =
    anterior && dt > 0 ? (distanciaKm(anterior, punto) * MS_POR_HORA) / dt : 0

  const rumboNavegador = finito(coordenadas?.heading)

  return {
    lat: punto.lat,
    lng: punto.lng,
    t: punto.t,
    velocidadKmh: velocidadMs !== null && velocidadMs >= 0 ? velocidadMs * 3.6 : derivada,
    rumbo:
      rumboNavegador !== null
        ? normalizarRumbo(rumboNavegador)
        : anterior
          ? rumboEntre(anterior, punto)
          : null,
    altitud: finito(coordenadas?.altitude),
  }
}
