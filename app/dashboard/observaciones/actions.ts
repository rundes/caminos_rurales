'use server'

import { revalidatePath } from 'next/cache'
import { revalidarMunicipio } from '@/lib/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaCambioEstado, primerError } from '@/lib/validaciones'

const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_PERFIL = 'No se pudo cargar tu perfil.'
const ERROR_GENERICO = 'No se pudo actualizar el estado. Intentá de nuevo.'
const ERROR_PERMISO = 'No tenés permiso para cambiar el estado de esta observación.'

/**
 * Cambia el estado de gestión de una observación (pendiente / en obra /
 * resuelta / descartada), con nota opcional.
 *
 * El update lo hace el cliente CON sesión (no el admin): la política
 * `fallas_update_estado_gestion` (rol municipio/auditor + municipio propio) y
 * el trigger `fallas_estado_no_escalar` (0010) son el gate real, no esta
 * función — si RLS rechaza la fila (0 filas devueltas) o el trigger la
 * corta, se traduce a un mensaje de permiso, no de error genérico.
 */
export async function cambiarEstado(
  observacionId: string,
  estado: string,
  nota?: string,
): Promise<ResultadoAccion> {
  const parseo = esquemaCambioEstado.safeParse({ observacionId, estado, nota })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: ERROR_SESION }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('municipio_id')
    .eq('id', user.id)
    .maybeSingle()
  if (errorPerfil) {
    console.error('[observaciones]', errorPerfil.message)
    return { ok: false, error: ERROR_PERFIL }
  }

  const { error, data } = await supabase
    .from('fallas_deteccion')
    .update({
      estado: parseo.data.estado,
      estado_nota: parseo.data.nota ?? null,
      estado_at: new Date().toISOString(),
      estado_por: user.id,
    })
    .eq('id', parseo.data.observacionId)
    .select('id')

  if (error) {
    if (error.code === '42501' || error.message.includes('row-level security') || error.message.includes('Solo municipio')) {
      return { ok: false, error: ERROR_PERMISO }
    }
    console.error('[observaciones]', error.message)
    return { ok: false, error: ERROR_GENERICO }
  }
  if (!data || data.length === 0) return { ok: false, error: ERROR_PERMISO }

  revalidatePath('/dashboard/observaciones')
  revalidatePath('/dashboard/mapa')
  if (perfil?.municipio_id) revalidarMunicipio(perfil.municipio_id)

  return { ok: true, data: undefined }
}
