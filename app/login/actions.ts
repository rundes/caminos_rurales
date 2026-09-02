'use server'

import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaLogin, esquemaRegistro, primerError } from '@/lib/validaciones'

export type EstadoAuth = ResultadoAccion | undefined

const MENSAJES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos',
  'User already registered': 'Ese email ya está registrado',
  'Email not confirmed': 'Confirmá tu email antes de ingresar',
}

function traducir(mensaje: string): string {
  return MENSAJES[mensaje] ?? `Error de autenticación: ${mensaje}`
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
  const parseo = esquemaRegistro.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    nombre: formData.get('nombre'),
    municipio_id: formData.get('municipio_id'),
  })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const { email, password, nombre, municipio_id } = parseo.data
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre, municipio_id } },
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
  redirect('/login')
}
