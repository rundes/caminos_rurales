'use server'

import { redirect } from 'next/navigation'
import { traducirAuth } from '@/lib/auth-mensajes'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaNuevaClave, primerError } from '@/lib/validaciones'

export type EstadoNuevaClave = ResultadoAccion | undefined

const ERROR_SESION =
  'El enlace no es válido o venció. Pedí uno nuevo desde "Recuperar contraseña".'

/**
 * Actualiza la contraseña con la sesión de recuperación que dejó
 * `app/auth/confirm/route.ts` al exchangear el `code` del enlace emailado.
 * Sin esa sesión (enlace vencido, ya usado, o entrado directo a esta URL sin
 * pasar por el enlace) `getUser()` no devuelve usuario y no se puede seguir.
 */
export async function actualizarClave(
  _prev: EstadoNuevaClave,
  formData: FormData,
): Promise<EstadoNuevaClave> {
  const parseo = esquemaNuevaClave.safeParse({ password: formData.get('password') })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: ERROR_SESION }

  const { error } = await supabase.auth.updateUser({ password: parseo.data.password })
  if (error) return { ok: false, error: traducirAuth(error.message) }

  redirect('/dashboard')
}
