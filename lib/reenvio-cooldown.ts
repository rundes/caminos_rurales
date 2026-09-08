/**
 * Cooldown del botón "Reenviar correo de confirmación" en el login: función
 * pura (sin `Date.now()` adentro) para poder testearla sin mockear el reloj.
 * Supabase también rate-limita el reenvío en el servidor; esto es una
 * segunda barrera en la UI para que no se pueda espamear el botón.
 */
export const DURACION_COOLDOWN_MS = 60_000

/** Segundos restantes de cooldown, redondeados hacia arriba; 0 si ya terminó o no empezó. */
export function segundosRestantesCooldown(
  inicio: number | null,
  ahora: number,
  duracionMs: number = DURACION_COOLDOWN_MS,
): number {
  if (inicio === null) return 0
  const restanteMs = inicio + duracionMs - ahora
  return restanteMs > 0 ? Math.ceil(restanteMs / 1000) : 0
}
