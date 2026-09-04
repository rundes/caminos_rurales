import type { Severidad } from '../tipos'
import type { CalidadSegmento } from './tipos'
import {
  MUESTRAS_MINIMAS_SEGMENTO,
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

/**
 * Recalcula la calidad de un segmento en el servidor a partir de sus datos
 * numéricos, ignorando la que haya mandado el cliente: es el único campo del
 * payload que un cliente modificado podría falsear para inflar la cobertura.
 * Con menos del piso de eventos de movimiento, el segmento queda `sin_dato`
 * aunque la rugosidad reportada sea buena.
 */
export function normalizarMuestra<
  T extends { muestras: number; rmsVertical: number; velocidadKmh: number; calidad: CalidadSegmento },
>(m: T): T {
  const calidad: CalidadSegmento =
    m.muestras < MUESTRAS_MINIMAS_SEGMENTO ? 'sin_dato' : calidadDeSegmento(m.rmsVertical, m.velocidadKmh)
  return { ...m, calidad }
}
