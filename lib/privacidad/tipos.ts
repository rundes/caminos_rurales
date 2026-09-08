/** Caja en píxeles de la imagen, origen arriba-izquierda (igual que el canvas). */
export type CajaPx = { x: number; y: number; ancho: number; alto: number }

export type TipoRegion = 'cara' | 'persona' | 'vehiculo'

/** Una detección cruda del modelo, antes de aplicar margen ni umbral. */
export type RegionDetectada = { caja: CajaPx; tipo: TipoRegion; confianza: number }

/** Lo mínimo que el pipeline necesita de una imagen ya decodificada para
 * dibujarla en el canvas de trabajo. Un `HTMLImageElement` o `ImageBitmap`
 * real lo cumple de sobra; en los tests alcanza con un objeto con estas dos
 * propiedades. */
export type FuenteImagen = { width: number; height: number }

/**
 * Detector inyectable: aísla el modelo real (TensorFlow.js corriendo en el
 * navegador) de la orquestación pura del difuminado, igual que `DepsCaptura`
 * aísla el canvas en `lib/camara/captura.ts`. `cargar` es idempotente y
 * separada de `detectar` para poder precargar el modelo (potencialmente
 * varios MB) antes de que la cola empiece a difuminar cuadros — ver
 * `lib/privacidad/modelo.ts`.
 */
export type DetectorPrivacidad = {
  cargar(): Promise<void>
  detectar(datos: ImageData): Promise<RegionDetectada[]>
}
