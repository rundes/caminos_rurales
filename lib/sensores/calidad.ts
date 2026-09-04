import type { Severidad } from '../tipos'
import type { CalidadSegmento } from './tipos'
import {
  PICO_SEVERIDAD_ALTA,
  PICO_SEVERIDAD_MEDIA,
  RMS_BUENO,
  RMS_MALO,
  RMS_REGULAR,
  VELOCIDAD_MINIMA_KMH,
} from './umbrales'

/**
 * Calidad estimada de un segmento a partir de su rugosidad. Debajo de la
 * velocidad mínima (o sin datos numéricos válidos) la vibración no es
 * comparable, así que el segmento queda sin clasificar.
 */
export function calidadDeSegmento(rmsVertical: number, velocidadKmh: number): CalidadSegmento {
  if (!Number.isFinite(rmsVertical) || !Number.isFinite(velocidadKmh)) return 'sin_dato'
  if (rmsVertical < 0) return 'sin_dato'
  if (velocidadKmh < VELOCIDAD_MINIMA_KMH) return 'sin_dato'
  if (rmsVertical < RMS_BUENO) return 'bueno'
  if (rmsVertical < RMS_REGULAR) return 'regular'
  if (rmsVertical < RMS_MALO) return 'malo'
  return 'intransitable'
}

/** Severidad de la observación automática que genera un impacto. */
export function severidadDeImpacto(pico: number): Severidad {
  if (pico < PICO_SEVERIDAD_MEDIA) return 'baja'
  if (pico < PICO_SEVERIDAD_ALTA) return 'media'
  return 'alta'
}
