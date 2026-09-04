/**
 * Preferencia de red para subir los cuadros. Por defecto solo con WiFi: un
 * recorrido largo son cientos de MB y la mayoría de los relevamientos se hacen
 * con datos móviles limitados.
 */
export type PreferenciaRed = 'wifi' | 'siempre'

/** Lo que expone `navigator.connection` cuando existe (no está en iOS). */
export type Conexion = { type?: string } | undefined

export type EstadoRed = {
  permitida: boolean
  /**
   * `false` cuando el navegador no informa el tipo de red: se deja subir igual
   * pero la UI avisa que no pudimos verificar que sea WiFi.
   */
  verificada: boolean
}

export const PREFERENCIA_RED_DEFECTO: PreferenciaRed = 'wifi'
export const CLAVE_PREFERENCIA_RED = 'visiovial.cuadros.red'

/**
 * ¿Se pueden subir cuadros con la red actual? Con `siempre` no se mira nada.
 * Con `wifi` hace falta que el navegador informe `type === 'wifi'`; si no
 * informa el tipo (iOS y varios Android) se deja pasar sin verificar, porque
 * bloquear sería no subir nunca en esos dispositivos.
 */
export function redPermitida(preferencia: PreferenciaRed, conexion: Conexion): EstadoRed {
  if (preferencia === 'siempre') return { permitida: true, verificada: true }
  if (!conexion || conexion.type === undefined) return { permitida: true, verificada: false }
  return { permitida: conexion.type === 'wifi', verificada: true }
}

type NavegadorConConexion = Navigator & { connection?: { type?: string } }

/** Conexión informada por el navegador, o `undefined` si no la expone. */
export function conexionActual(): Conexion {
  if (typeof navigator === 'undefined') return undefined
  return (navigator as NavegadorConConexion).connection
}

/** Preferencia guardada en el dispositivo. Sin `localStorage` vale el defecto. */
export function leerPreferenciaRed(): PreferenciaRed {
  if (typeof window === 'undefined') return PREFERENCIA_RED_DEFECTO
  try {
    return window.localStorage.getItem(CLAVE_PREFERENCIA_RED) === 'siempre'
      ? 'siempre'
      : PREFERENCIA_RED_DEFECTO
  } catch (error) {
    console.error('[camara]', error)
    return PREFERENCIA_RED_DEFECTO
  }
}

/** Oyentes del ajuste, para que la UI se entere cuando se cambia. */
const oyentes = new Set<() => void>()

export function guardarPreferenciaRed(preferencia: PreferenciaRed): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(CLAVE_PREFERENCIA_RED, preferencia)
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
export function suscribirPreferenciaRed(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}
