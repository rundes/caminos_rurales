'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaLogin, esquemaRegistro, primerError } from '@/lib/validaciones'

export type EstadoAuth = ResultadoAccion | undefined

const ERROR_CODIGO = 'El código de invitación no es válido'

/**
 * El municipio ya no lo elige quien se registra: lo determina el código de
 * invitación que le dio su municipio (`handle_new_user` lo resuelve contra
 * `codigos_invitacion`). Por eso se saca `municipio_id` del esquema base.
 */
const esquemaRegistroConCodigo = esquemaRegistro.omit({ municipio_id: true }).extend({
  codigo_invitacion: z
    .string()
    .trim()
    .min(4, { message: ERROR_CODIGO })
    .max(40, { message: ERROR_CODIGO }),
})

const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'User already registered': 'Ese email ya está registrado',
  'Email not confirmed': 'Confirmá tu email antes de ingresar',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 8 caracteres',
  'Email rate limit exceeded': 'Demasiados intentos. Esperá unos minutos.',
}

const MENSAJE_GENERICO = 'No se pudo completar la operación. Intentá de nuevo.'

function traducir(mensaje: string): string {
  const traducido = MENSAJES[mensaje]
  if (traducido) return traducido

  console.error('[auth]', mensaje)
  return MENSAJE_GENERICO
}

export async function signIn(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const parseo = esquemaLogin.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword(parseo.data)
  if (error) return { ok: false, error: traducir(error.message) }

  redirect('/dashboard')
}

export async function signUpAction(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const parseo = esquemaRegistroConCodigo.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    nombre: formData.get('nombre'),
    codigo_invitacion: formData.get('codigo_invitacion'),
  })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const { email, password, nombre, codigo_invitacion } = parseo.data
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre, codigo_invitacion } },
  })
  if (error) return { ok: false, error: traducir(error.message) }

  if (!data.session) {
    return { ok: true, data: undefined }
  }
  redirect('/dashboard')
}

export async function signOut(): Promise<void> {
  const supabase = await crearClienteServidor()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
