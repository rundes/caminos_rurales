/**
 * Umbrales de la captura de cuadros con la cámara durante el recorrido.
 * Están en un módulo aparte para que la lógica pura, el hook y los tests
 * compartan exactamente los mismos números.
 */

/** Distancia recorrida desde el último cuadro que dispara uno nuevo. */
export const DISTANCIA_CUADRO_M = 100
/** Tiempo desde el último cuadro que dispara uno nuevo si se va rápido. */
export const INTERVALO_CUADRO_MS = 10_000
/** Debajo de esta velocidad el disparo por tiempo no aplica (auto detenido). */
export const VELOCIDAD_MINIMA_CUADRO_KMH = 15

/** Ancho al que se reescala el cuadro antes de comprimirlo. */
export const ANCHO_CUADRO_PX = 1280
/** Calidad JPEG del cuadro: ~120 KB con 1280 px de ancho. */
export const CALIDAD_JPEG = 0.7

/** Tope de cuadros por recorrido: 2000 × ~120 KB ≈ 240 MB. */
export const MAX_CUADROS_RECORRIDO = 2000
/** Debajo de este espacio libre estimado se pausa la captura. */
export const ALMACENAMIENTO_MINIMO_BYTES = 300 * 1024 * 1024

/** Tope de velocidad que acepta el servidor: por encima se guarda sin dato. */
export const VELOCIDAD_MAXIMA_CUADRO_KMH = 400

/** Cuadros por llamada a `registrarCuadros` (el servidor acepta hasta 200). */
export const LOTE_CUADROS = 20
