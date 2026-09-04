// Umbrales de la captura por sensores. Están todos acá para poder calibrarlos
// con datos reales sin tocar la lógica. Las unidades son m/s², km/h, metros y
// milisegundos según corresponda.

/** Filtro pasa-bajos que estima el vector gravedad a partir del acelerómetro. */
export const ALFA_GRAVEDAD = 0.02

/** Duración de la calibración inicial de gravedad antes de agregar segmentos. */
export const CALIBRACION_MS = 3000

/** Un segmento se cierra a los 5 s o a los 100 m, lo que ocurra primero. */
export const SEGMENTO_MS = 5000
export const SEGMENTO_M = 100

/**
 * Debajo de esta velocidad la vibración no dice nada del camino (motor al
 * ralentí, maniobras), así que el segmento queda como `sin_dato`.
 */
export const VELOCIDAD_MINIMA_KMH = 15

/** Cortes de RMS vertical que separan las calidades de un segmento. */
export const RMS_BUENO = 1
export const RMS_REGULAR = 2
export const RMS_MALO = 3.5

/**
 * Piso de eventos de movimiento por segmento para confiar en su calidad. El
 * servidor recalcula la calidad ignorando la que mande el cliente; por debajo
 * de este piso el segmento queda `sin_dato` sin importar la rugosidad.
 */
export const MUESTRAS_MINIMAS_SEGMENTO = 20

/** Aceleración longitudinal que cuenta como frenada brusca. */
export const UMBRAL_FRENADA = -3

/** Aceleración lateral (en valor absoluto) que cuenta como maniobra lateral. */
export const UMBRAL_LATERAL = 3

/** Pico de aceleración vertical que dispara un impacto. */
export const PICO_IMPACTO = 6

/** Ventana muerta después de un impacto para no contar el rebote. */
export const DEBOUNCE_IMPACTO_MS = 1500

/** Cortes de pico que separan las severidades de un impacto. */
export const PICO_SEVERIDAD_MEDIA = 9
export const PICO_SEVERIDAD_ALTA = 13

/** Distancia máxima entre una muestra y un tramo para asignársela. */
export const RADIO_TRAMO_M = 40

/** Paso de muestreo de la geometría de los tramos al armar el índice. */
export const PASO_MUESTREO_TRAMO_M = 25

/**
 * Fracción del recorrido que tiene que estar cubierta por segmentos con datos
 * para que el recorrido sume puntos por sensores.
 */
export const FRACCION_SENSOR_MINIMA = 0.5

/** Techos del payload: más que esto se descarta en el cliente. */
export const MAX_MUESTRAS = 5000
export const MAX_IMPACTOS = 500
