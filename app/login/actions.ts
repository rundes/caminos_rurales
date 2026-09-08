'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { traducirAuth } from '@/lib/auth-mensajes'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaLogin, esquemaRegistro, primerError } from '@/lib/validaciones'

/**
 * `codigo` es opcional y solo lo usa el formulario para decidir cuándo
 * ofrecer "Reenviar correo de confirmación": no cambia el contrato de
 * `ResultadoAccion` que usa el resto de la app.
 */
export type EstadoAuth = (ResultadoAccion & { codigo?: 'email_no_confirmado' }) | undefined

const ERROR_CODIGO = 'El código de invitación no es válido'
const ERROR_EMAIL_NO_CONFIRMADO = 'Email not confirmed'

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

export async function signIn(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const parseo = esquemaLogin.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.signInWithPassword(parseo.data)
  if (error) {
    const codigo = error.message === ERROR_EMAIL_NO_CONFIRMADO ? 'email_no_confirmado' : undefined
    return { ok: false, error: traducirAuth(error.message), codigo }
  }

  redirect('/dashboard')
}

const esquemaReenvio = z.object({
  email: z.email({ message: 'Email inválido' }),
})

/**
 * Reenvía el correo de confirmación de una cuenta sin confirmar
 * (`supabase.auth.resend`). El botón del login lo limita a un intento cada
 * ~60 s en la UI (`lib/reenvio-cooldown.ts`); Supabase también rate-limita
 * el reenvío en el servidor.
 */
export async function reenviarConfirmacion(_prev: EstadoAuth, formData: FormData): Promise<EstadoAuth> {
  const parseo = esquemaReenvio.safeParse({ email: formData.get('email') })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.resend({ type: 'signup', email: parseo.data.email })
  if (error) return { ok: false, error: traducirAuth(error.message) }

  return { ok: true, data: undefined }
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
  if (error) return { ok: false, error: traducirAuth(error.message) }

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
