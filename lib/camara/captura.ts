import { distanciaKm } from '@/lib/geo'
import {
  ANCHO_CUADRO_PX,
  CALIDAD_JPEG,
  DISTANCIA_CUADRO_M,
  INTERVALO_CUADRO_MS,
  VELOCIDAD_MAXIMA_CUADRO_KMH,
  VELOCIDAD_MINIMA_CUADRO_KMH,
} from './umbrales'

export const TIPO_CUADRO = 'image/jpeg'

export const ERROR_SIN_VIDEO = 'La cámara todavía no está mostrando imagen.'
export const ERROR_SIN_CONTEXTO = 'Este navegador no puede procesar la imagen de la cámara.'

/** Posición y momento del último cuadro guardado. */
export type UltimoCuadro = { lat: number; lng: number; t: number }

/** Punto GPS aceptado sobre el que se evalúa el disparo. */
export type PuntoCuadro = {
  lat: number
  lng: number
  t: number
  velocidadKmh: number | null
  rumbo?: number | null
}

export type UmbralesCaptura = {
  distanciaM: number
  intervaloMs: number
  velocidadMinimaKmh: number
}

export const UMBRALES_CAPTURA: UmbralesCaptura = {
  distanciaM: DISTANCIA_CUADRO_M,
  intervaloMs: INTERVALO_CUADRO_MS,
  velocidadMinimaKmh: VELOCIDAD_MINIMA_CUADRO_KMH,
}

/**
 * ¿Corresponde sacar un cuadro en este punto?
 *
 * Sin cuadro previo siempre sí (el primero del recorrido). Después: cada
 * `distanciaM` recorridos, o cada `intervaloMs` si se va a más de
 * `velocidadMinimaKmh` (en ruta 100 m se hacen en pocos segundos, pero con el
 * auto detenido el disparo por tiempo llenaría el disco de fotos iguales).
 */
export function debeDisparar(
  ultimo: UltimoCuadro | null,
  actual: PuntoCuadro,
  umbrales: UmbralesCaptura = UMBRALES_CAPTURA,
): boolean {
  if (!ultimo) return true

  const metros = distanciaKm(ultimo, actual) * 1000
  if (metros >= umbrales.distanciaM) return true

  const transcurrido = actual.t - ultimo.t
  const velocidad = actual.velocidadKmh ?? 0
  return transcurrido >= umbrales.intervaloMs && velocidad >= umbrales.velocidadMinimaKmh
}

/**
 * Velocidad lista para guardar: fuera de rango (GPS ruidoso) o sin dato queda
 * en `null`, que es lo que el servidor acepta, en vez de romper todo el lote.
 */
export function normalizarVelocidad(velocidadKmh: number | null | undefined): number | null {
  if (velocidadKmh === null || velocidadKmh === undefined || !Number.isFinite(velocidadKmh)) {
    return null
  }
  return velocidadKmh < 0 || velocidadKmh > VELOCIDAD_MAXIMA_CUADRO_KMH ? null : velocidadKmh
}

/** Rumbo listo para guardar. Con el vehículo detenido el navegador informa `NaN`. */
export function normalizarRumbo(rumbo: number | null | undefined): number | null {
  if (rumbo === null || rumbo === undefined || !Number.isFinite(rumbo)) return null
  return rumbo < 0 || rumbo > 360 ? null : rumbo
}

/** Lo mínimo que la captura necesita del `<video>`: sus dimensiones reales. */
export type FuenteCuadro = { videoWidth: number; videoHeight: number }

export type ContextoCaptura = {
  drawImage(fuente: FuenteCuadro, x: number, y: number, ancho: number, alto: number): void
}

/** Lo mínimo que la captura necesita del canvas. `HTMLCanvasElement` lo cumple. */
export type LienzoCaptura = {
  width: number
  height: number
  getContext(tipo: '2d'): ContextoCaptura | null
  toBlob(callback: (blob: Blob | null) => void, tipo?: string, calidad?: number): void
}

export type DepsCaptura = {
  crearCanvas: (ancho: number, alto: number) => LienzoCaptura
}

export const DEPS_CAPTURA: DepsCaptura = {
  crearCanvas: (ancho, alto) => {
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    // `HTMLCanvasElement` cumple el contrato, pero `drawImage` está declarado
    // con sobrecargas sobre `CanvasImageSource` y TypeScript no lo reconcilia
    // con la fuente mínima que usamos acá (ni en los dobles de test).
    return lienzo as unknown as LienzoCaptura
  },
}

/**
 * Saca un cuadro del `<video>` a JPEG de `ANCHO_CUADRO_PX` de ancho (nunca
 * agranda) conservando la relación de aspecto. El canvas se inyecta para poder
 * testear sin un canvas real (jsdom no lo implementa).
 */
export async function capturarCuadro(
  video: FuenteCuadro,
  deps: DepsCaptura = DEPS_CAPTURA,
): Promise<Blob> {
  const anchoFuente = video.videoWidth
  const altoFuente = video.videoHeight
  if (!anchoFuente || !altoFuente) throw new Error(ERROR_SIN_VIDEO)

  const escala = Math.min(1, ANCHO_CUADRO_PX / anchoFuente)
  const ancho = Math.round(anchoFuente * escala)
  const alto = Math.round(altoFuente * escala)

  const lienzo = deps.crearCanvas(ancho, alto)
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error(ERROR_SIN_CONTEXTO)
  contexto.drawImage(video, 0, 0, ancho, alto)

  return new Promise<Blob>((resolver, rechazar) => {
    lienzo.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new Error(ERROR_SIN_VIDEO))),
      TIPO_CUADRO,
      CALIDAD_JPEG,
    )
  })
}
