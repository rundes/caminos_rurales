/**
 * Ajuste "difuminar caras y vehículos" (`lib/privacidad/`), guardado en
 * `localStorage` igual que la preferencia de red (`lib/camara/red.ts`).
 * Activado por defecto: la persona tiene que apagarlo a propósito para subir
 * cuadros sin procesar.
 */
export const CLAVE_PREFERENCIA_PRIVACIDAD = 'visiovial.cuadros.privacidad'
export const PREFERENCIA_PRIVACIDAD_DEFECTO = true

/** Preferencia guardada en el dispositivo. Sin `localStorage` vale el defecto. */
export function leerPreferenciaPrivacidad(): boolean {
  if (typeof window === 'undefined') return PREFERENCIA_PRIVACIDAD_DEFECTO
  try {
    const guardada = window.localStorage.getItem(CLAVE_PREFERENCIA_PRIVACIDAD)
    return guardada === null ? PREFERENCIA_PRIVACIDAD_DEFECTO : guardada === '1'
  } catch (error) {
    console.error('[camara]', error)
    return PREFERENCIA_PRIVACIDAD_DEFECTO
  }
}

/** Oyentes del ajuste, para que la UI se entere cuando se cambia. */
const oyentes = new Set<() => void>()

export function guardarPreferenciaPrivacidad(activado: boolean): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CLAVE_PREFERENCIA_PRIVACIDAD, activado ? '1' : '0')
    } catch (error) {
      console.error('[camara]', error)
    }
  }
  oyentes.forEach((oyente) => oyente())
}

/**
 * Suscripción al ajuste para `useSyncExternalStore`: `localStorage` es un
 * sistema externo, así se lee después de hidratar sin `setState` en un efecto.
 */
export function suscribirPreferenciaPrivacidad(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}
