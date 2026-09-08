import { pixelarRegiones } from './desenfoque'
import { regionesABloquear } from './regiones'
import type { DetectorPrivacidad, FuenteImagen } from './tipos'

export const TIPO_SALIDA = 'image/jpeg'
/** Calidad algo menor que la captura original (`CALIDAD_JPEG` = 0.7): ya se
 * reencodeó una vez, no vale la pena pagar más peso por una segunda pasada. */
export const CALIDAD_SALIDA = 0.7

export const ERROR_SIN_CONTEXTO = 'Este navegador no puede procesar la imagen para difuminarla.'
export const ERROR_SIN_BLOB = 'No se pudo generar el cuadro difuminado.'

export type ContextoDifuminado = {
  drawImage(fuente: FuenteImagen, x: number, y: number): void
  getImageData(x: number, y: number, ancho: number, alto: number): ImageData
  putImageData(datos: ImageData, x: number, y: number): void
}

/** Lo mínimo que el difuminado necesita del canvas. `HTMLCanvasElement` lo cumple. */
export type LienzoDifuminado = {
  width: number
  height: number
  getContext(tipo: '2d'): ContextoDifuminado | null
  toBlob(callback: (blob: Blob | null) => void, tipo?: string, calidad?: number): void
}

export type DepsDifuminado = {
  crearCanvas: (ancho: number, alto: number) => LienzoDifuminado
  /** Decodifica el JPEG original a algo dibujable en canvas
   * (`createImageBitmap` en el navegador real). */
  decodificar: (blob: Blob) => Promise<FuenteImagen>
}

export const DEPS_DIFUMINADO: DepsDifuminado = {
  crearCanvas: (ancho, alto) => {
    const lienzo = document.createElement('canvas')
    lienzo.width = ancho
    lienzo.height = alto
    // Mismo motivo que en `lib/camara/captura.ts`: `drawImage` tiene
    // sobrecargas sobre `CanvasImageSource` que TypeScript no reconcilia con
    // la fuente mínima que usamos acá (ni con el doble de los tests).
    return lienzo as unknown as LienzoDifuminado
  },
  decodificar: (blob) => createImageBitmap(blob),
}

/**
 * Difumina un cuadro: detecta caras, personas y vehículos, pixela esas
 * regiones (con margen, `lib/privacidad/regiones.ts`) y reencodea a JPEG. El
 * resultado es un blob nuevo — el original nunca sale de esta función hacia
 * la red, la cola de subida solo sube lo que esto devuelve (ver
 * `lib/local/cola-cuadros.ts`). Si el detector no encuentra nada igual
 * reencodea: mismo costo que cualquier cuadro y simplifica al llamador, que
 * siempre recibe un blob "procesado" lo haya hecho falta o no.
 */
export async function difuminarCuadro(
  blob: Blob,
  detector: DetectorPrivacidad,
  deps: DepsDifuminado = DEPS_DIFUMINADO,
): Promise<Blob> {
  await detector.cargar()

  const imagen = await deps.decodificar(blob)
  const lienzo = deps.crearCanvas(imagen.width, imagen.height)
  const contexto = lienzo.getContext('2d')
  if (!contexto) throw new Error(ERROR_SIN_CONTEXTO)

  contexto.drawImage(imagen, 0, 0)
  const datos = contexto.getImageData(0, 0, imagen.width, imagen.height)

  const detecciones = await detector.detectar(datos)
  const cajas = regionesABloquear(detecciones, imagen.width, imagen.height)
  pixelarRegiones(datos, cajas)

  contexto.putImageData(datos, 0, 0)

  return new Promise<Blob>((resolver, rechazar) => {
    lienzo.toBlob(
      (resultado) => (resultado ? resolver(resultado) : rechazar(new Error(ERROR_SIN_BLOB))),
      TIPO_SALIDA,
      CALIDAD_SALIDA,
    )
  })
}
