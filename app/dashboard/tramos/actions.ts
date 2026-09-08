'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { revalidarMunicipio } from '@/lib/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import { kmDeGeometria } from '@/lib/tramos'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaTramo, primerError, type TramoPayload } from '@/lib/validaciones'

const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_PERFIL = 'No se pudo cargar tu perfil.'
const ERROR_GENERICO = 'No se pudo guardar el tramo. Intentá de nuevo.'
const ERROR_PERMISO = 'No tenés permiso para crear o editar tramos.'
const ERROR_ID = 'Tramo sin identificador válido.'

/** Prefijo de los `id` de tramos creados desde la app, para no chocar con los ids numéricos de OSM (`scripts/seed-tramos.mjs`). */
const PREFIJO_ID_MANUAL = 'manual-'

type Perfil = { rol: string; municipio_id: string }

/**
 * Sesión + perfil + rol de gestión, en un solo lugar para `crearTramo` y
 * `actualizarTramo`. El chequeo de rol acá es solo para un mensaje de error
 * temprano y claro: el gate real es la política RLS `tramos_insert_gestion`/
 * `tramos_update_gestion` (rol_actual() + municipio_actual()), que no
 * confía en lo que diga el cliente.
 */
async function sesionDeGestion(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof crearClienteServidor>>; perfil: Perfil }
  | { ok: false; error: string }
> {
  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: ERROR_SESION }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('rol, municipio_id')
    .eq('id', user.id)
    .maybeSingle()

  if (errorPerfil || !perfil) {
    console.error('[tramos]', errorPerfil?.message ?? 'perfil no encontrado')
    return { ok: false, error: ERROR_PERFIL }
  }
  if (perfil.rol !== 'municipio' && perfil.rol !== 'auditor') {
    return { ok: false, error: ERROR_PERMISO }
  }

  // Objeto nuevo (no `perfil` tal cual): la propiedad `rol` recién chequeada
  // arriba se angosta a 'municipio' | 'auditor' en cada acceso puntual, pero
  // no en el objeto `perfil` como un todo si se lo reenvía sin más.
  return { ok: true, supabase, perfil: { rol: perfil.rol, municipio_id: perfil.municipio_id } }
}

function esErrorPermiso(error: { code?: string; message: string }): boolean {
  return error.code === '42501' || error.message.includes('row-level security') || error.message.includes('Solo municipio')
}

/**
 * Crea un tramo nuevo en el municipio propio. `km` nunca viene del cliente:
 * se calcula acá con `kmDeGeometria` a partir de los puntos dibujados.
 */
export async function crearTramo(input: TramoPayload): Promise<ResultadoAccion<{ id: string }>> {
  const parseo = esquemaTramo.safeParse(input)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const sesion = await sesionDeGestion()
  if (!sesion.ok) return sesion

  const km = kmDeGeometria(parseo.data.geometria)
  const id = `${PREFIJO_ID_MANUAL}${randomUUID()}`

  const { data, error } = await sesion.supabase
    .from('tramos')
    .insert({
      id,
      municipio: sesion.perfil.municipio_id,
      nombre_codigo: parseo.data.nombreCodigo,
      localidad: parseo.data.localidad,
      km,
      geometria: parseo.data.geometria,
      activo: parseo.data.activo,
    })
    .select('id')
    .single()

  if (error) {
    if (esErrorPermiso(error)) return { ok: false, error: ERROR_PERMISO }
    console.error('[tramos]', error.message)
    return { ok: false, error: ERROR_GENERICO }
  }

  revalidatePath('/dashboard/tramos')
  revalidarMunicipio(sesion.perfil.municipio_id)

  return { ok: true, data: { id: data.id } }
}

/**
 * Edita un tramo existente. La política `tramos_update_gestion` exige que el
 * tramo ya sea del municipio propio (no se acepta `municipio` en el payload:
 * no hay forma de pedir moverlo a otro), así que 0 filas afectadas es
 * indistinguible de "no tenés permiso" — se traduce a ese mensaje.
 */
export async function actualizarTramo(id: string, input: TramoPayload): Promise<ResultadoAccion> {
  if (typeof id !== 'string' || id.trim().length === 0) return { ok: false, error: ERROR_ID }

  const parseo = esquemaTramo.safeParse(input)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const sesion = await sesionDeGestion()
  if (!sesion.ok) return sesion

  const km = kmDeGeometria(parseo.data.geometria)

  const { data, error } = await sesion.supabase
    .from('tramos')
    .update({
      nombre_codigo: parseo.data.nombreCodigo,
      localidad: parseo.data.localidad,
      km,
      geometria: parseo.data.geometria,
      activo: parseo.data.activo,
    })
    .eq('id', id)
    .select('id')

  if (error) {
    if (esErrorPermiso(error)) return { ok: false, error: ERROR_PERMISO }
    console.error('[tramos]', error.message)
    return { ok: false, error: ERROR_GENERICO }
  }
  if (!data || data.length === 0) return { ok: false, error: ERROR_PERMISO }

  revalidatePath('/dashboard/tramos')
  revalidatePath(`/dashboard/tramos/${id}`)
  revalidarMunicipio(sesion.perfil.municipio_id)

  return { ok: true, data: undefined }
}
