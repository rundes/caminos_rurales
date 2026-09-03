'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'

export type EstadoTerminos = ResultadoAccion | undefined

const ERROR_SIN_ACEPTAR = 'Marcá la casilla para aceptar los términos'
const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_GENERICO = 'No se pudieron guardar los términos. Intentá de nuevo.'

/** Registra la aceptación de términos del usuario y lo lleva al inicio. */
export async function aceptarTerminos(
  _prev: EstadoTerminos,
  formData: FormData,
): Promise<EstadoTerminos> {
  if (!formData.get('acepto')) return { ok: false, error: ERROR_SIN_ACEPTAR }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: ERROR_SESION }

  const { error } = await supabase
    .from('perfiles')
    .update({ acepto_terminos_at: new Date().toISOString() })
    .eq('id', user.id)

  if (error) {
    console.error('[terminos]', error.message)
    return { ok: false, error: ERROR_GENERICO }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
