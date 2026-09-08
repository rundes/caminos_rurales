'use server'

import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { origenActual } from '@/lib/url-origen'
import { esquemaRecuperar, primerError } from '@/lib/validaciones'

export type EstadoRecuperar = ResultadoAccion | undefined

/** La ruta que exchangea el `code` PKCE del enlace por una sesión (`app/auth/confirm/route.ts`). */
const RUTA_CONFIRMAR = '/auth/confirm'
const DESTINO_TRAS_CONFIRMAR = '/nueva-clave'

/**
 * Pide el email de recuperación de contraseña. Siempre devuelve éxito (salvo
 * que el email tenga un formato inválido): nunca revela si la cuenta existe.
 */
export async function solicitarRecuperacion(
  _prev: EstadoRecuperar,
  formData: FormData,
): Promise<EstadoRecuperar> {
  const parseo = esquemaRecuperar.safeParse({ email: formData.get('email') })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  try {
    const supabase = await crearClienteServidor()
    const origen = await origenActual()
    const redirectTo = `${origen}${RUTA_CONFIRMAR}?next=${encodeURIComponent(DESTINO_TRAS_CONFIRMAR)}`

    const { error } = await supabase.auth.resetPasswordForEmail(parseo.data.email, { redirectTo })
    if (error) console.error('[recuperar]', error.message)
  } catch (error) {
    console.error('[recuperar]', error)
  }

  return { ok: true, data: undefined }
}
