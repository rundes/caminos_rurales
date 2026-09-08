'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'

/** Municipio del perfil mientras no haya canjeado un código válido. */
const SIN_ASIGNAR = 'sin-asignar'

/**
 * Motivos de rechazo. Viajan por la query al volver a `/pendiente`, así que son
 * códigos y no texto: la página elige el mensaje (ver `MENSAJES` en page.tsx).
 */
type MotivoRechazo = 'invalido' | 'sesion' | 'asignado' | 'generico'

const MENSAJES: Record<MotivoRechazo, string> = {
  invalido: 'Ese código no existe o ya no está activo',
  sesion: 'Sesión vencida. Volvé a ingresar.',
  asignado: 'Tu cuenta ya tiene un municipio asignado',
  generico: 'No se pudo aplicar el código. Intentá de nuevo.',
}

const esquemaCodigo = z
  .string()
  .trim()
  .min(4)
  .max(40)
  .transform((codigo) => codigo.toUpperCase())

/**
 * Canjea el código y asigna el municipio del perfil. Devuelve el motivo del
 * rechazo, o `null` si quedó asignado.
 *
 * `codigos_invitacion` no es legible desde la app (RLS sin políticas) y
 * `perfiles.municipio_id` no es escribible por la sesión del usuario (grant por
 * columna + trigger `perfiles_no_escalar`): las dos operaciones van con la
 * clave secreta. El `eq('municipio_id', SIN_ASIGNAR)` es la garantía de que
 * nadie se cambia de municipio una vez asignado.
 */
async function canjear(codigo: string): Promise<MotivoRechazo | null> {
  const parseo = esquemaCodigo.safeParse(codigo)
  if (!parseo.success) return 'invalido'

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return 'sesion'

  const admin = crearClienteAdmin()
  const { data: invitacion, error: eCodigo } = await admin
    .from('codigos_invitacion')
    .select('municipio')
    .eq('codigo', parseo.data)
    .eq('activo', true)
    .maybeSingle()

  if (eCodigo) {
    console.error('[pendiente]', eCodigo.message)
    return 'generico'
  }
  if (!invitacion) return 'invalido'

  const { data: filas, error: ePerfil } = await admin
    .from('perfiles')
    .update({ municipio_id: invitacion.municipio })
    .eq('id', user.id)
    .eq('municipio_id', SIN_ASIGNAR)
    .select('id')

  if (ePerfil) {
    console.error('[pendiente]', ePerfil.message)
    return 'generico'
  }
  if (!filas || filas.length === 0) return 'asignado'

  return null
}

/** Canjea un código y lleva al inicio; devuelve el error si no se pudo. */
export async function aplicarCodigo(codigo: string): Promise<ResultadoAccion> {
  const motivo = await canjear(codigo)
  if (motivo) return { ok: false, error: MENSAJES[motivo] }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}

/**
 * Adaptador para el `<form>` del servidor: sin JavaScript en el cliente el
 * motivo vuelve por la query para que la página muestre el mensaje.
 */
export async function enviarCodigo(formData: FormData): Promise<void> {
  const motivo = await canjear(String(formData.get('codigo') ?? ''))
  if (motivo) redirect(`/pendiente?error=${motivo}`)

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
