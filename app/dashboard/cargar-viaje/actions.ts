'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaRelevamiento, primerError } from '@/lib/validaciones'

export type DatosRelevamiento = { camino_id: string; origen_datos: string; km: string }

const SESION_VENCIDA = 'Sesión vencida. Volvé a ingresar.'
const esquemaIdRelevamiento = z.uuid()

export async function crearRelevamiento(
  datos: DatosRelevamiento,
): Promise<ResultadoAccion<{ id: string; km: number }>> {
  const parseo = esquemaRelevamiento.safeParse(datos)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: SESION_VENCIDA }

  const { data, error } = await supabase
    .from('relevamientos')
    .insert({
      usuario_id: user.id,
      camino_id: parseo.data.camino_id,
      origen_datos: parseo.data.origen_datos,
      metadata: { km: parseo.data.km, archivos: [] },
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('[cargar-viaje]', error?.message ?? 'insert sin datos')
    return { ok: false, error: 'No se pudo crear el relevamiento. Intentá de nuevo.' }
  }
  return { ok: true, data: { id: data.id, km: parseo.data.km } }
}

export async function registrarArchivos(
  relevamientoId: string,
  km: number,
  rutas: string[],
): Promise<ResultadoAccion> {
  const parseo = esquemaIdRelevamiento.safeParse(relevamientoId)
  if (!parseo.success) return { ok: false, error: 'Relevamiento inválido' }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: SESION_VENCIDA }

  const { error } = await supabase
    .from('relevamientos')
    .update({ metadata: { km, archivos: rutas } })
    .eq('id', parseo.data)
    .eq('usuario_id', user.id)

  if (error) {
    console.error('[cargar-viaje]', error.message)
    return { ok: false, error: 'No se pudieron registrar los archivos. Intentá de nuevo.' }
  }
  revalidatePath('/dashboard')
  return { ok: true, data: undefined }
}
