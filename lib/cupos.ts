import type { ClienteServidor } from './recorrido-servidor'

/** Tope diario de subidas de evidencia por usuario (antitrampa/anti-abuso). */
export const CUPO_SUBIDAS_DIA = 1500
/** Tope diario de recorridos nuevos por usuario. */
export const CUPO_RECORRIDOS_DIA = 30

export type TipoCupo = 'subidas' | 'recorridos'

/**
 * Intenta consumir una unidad del cupo diario `tipo` del usuario autenticado,
 * vía la función `consumir_cupo` (security definer, cuenta sobre `uso_diario`).
 * Devuelve `false` si el cupo ya se agotó. Un error del RPC también cuenta
 * como cupo agotado: ante la duda se bloquea en vez de dejar pasar sin control.
 */
export async function consumirCupo(
  supabase: ClienteServidor,
  tipo: TipoCupo,
  max: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('consumir_cupo', { p_tipo: tipo, p_max: max })
  if (error) {
    console.error('[cupos]', error.message)
    return false
  }
  return data === true
}
