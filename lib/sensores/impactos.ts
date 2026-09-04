import type { Impacto } from './tipos'
import { DEBOUNCE_IMPACTO_MS, PICO_IMPACTO } from './umbrales'

/** Posición y velocidad con las que se ubica un impacto. */
export type PosicionImpacto = { lat: number; lng: number; velocidadKmh: number }

export type DetectorImpactos = {
  /**
   * Evalúa una aceleración vertical. Devuelve el impacto cuando supera el
   * umbral y ya pasó la ventana muerta; en cualquier otro caso, `null`.
   */
  evaluar: (az: number, t: number, gps: PosicionImpacto | null) => Impacto | null
}

/**
 * Detector de baches y badenes: un pico de aceleración vertical por encima
 * del umbral dispara un impacto, y durante el debounce siguiente se ignoran
 * los rebotes de la suspensión (que son el mismo pozo, no otro).
 *
 * Sin posición conocida el impacto se descarta sin consumir la ventana muerta:
 * no tendría dónde ubicarse, y el próximo pico sí puede llegar a tenerla.
 */
export function crearDetectorImpactos(
  umbral: number = PICO_IMPACTO,
  debounceMs: number = DEBOUNCE_IMPACTO_MS,
): DetectorImpactos {
  let ultimo: number | null = null

  return {
    evaluar(az, t, gps) {
      const pico = Math.abs(az)
      if (!Number.isFinite(pico) || pico <= umbral) return null
      if (!gps) return null
      if (ultimo !== null && t - ultimo < debounceMs) return null

      ultimo = t
      return { t, lat: gps.lat, lng: gps.lng, pico, velocidadKmh: gps.velocidadKmh }
    },
  }
}
