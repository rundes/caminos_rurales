/**
 * Umbrales del difuminado de privacidad. Están en un módulo aparte, igual que
 * `lib/camara/umbrales.ts`, para que la lógica pura, el modelo real y los
 * tests compartan exactamente los mismos números.
 */

/** Confianza mínima para bloquear una detección de cara (BlazeFace). */
export const CONFIANZA_MINIMA_CARA = 0.7

/** Confianza mínima para una detección de persona o vehículo (COCO-SSD). */
export const CONFIANZA_MINIMA_OBJETO = 0.5

/**
 * Margen que se le agrega a cada caja detectada, como fracción de su propio
 * ancho/alto (a cada lado). El detector recorta ajustado al sujeto; sin
 * margen quedaría un borde nítido justo alrededor de la cara o la patente.
 */
export const MARGEN_CAJA_PCT = 0.25

/**
 * Lado (en px) de cada bloque del pixelado, sobre la imagen ya escalada a
 * `ANCHO_CUADRO_PX` (`lib/camara/umbrales.ts`). Bloques más grandes destruyen
 * el detalle original de forma más agresiva.
 */
export const LADO_BLOQUE_PIXELADO = 10

/**
 * Clases de COCO-SSD que se bloquean enteras. El sujeto de estos cuadros es
 * la superficie del camino, no los vehículos ni las personas que aparecen de
 * paso: perder el detalle de un auto o un peatón no cuesta nada, y de paso
 * tapa las patentes (que ningún detector liviano reconoce de forma
 * confiable) y a los ocupantes. `bicycle` queda afuera a propósito: una
 * bicicleta sola, sin una persona encima detectada aparte, no identifica a
 * nadie.
 */
export const CLASES_COCO_A_BLOQUEAR: ReadonlySet<string> = new Set([
  'person',
  'car',
  'motorcycle',
  'bus',
  'truck',
])
