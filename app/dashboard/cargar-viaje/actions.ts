'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaRelevamiento, primerError } from '@/lib/validaciones'

export type DatosRelevamiento = { camino_id: string; origen_datos: string; km: string }

export async function crearRelevamiento(datos: DatosRelevamiento): Promise<ResultadoAccion<{ id: string }>> {
  const parseo = esquemaRelevamiento.safeParse(datos)
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a ingresar.' }

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

  if (error || !data) return { ok: false, error: `No se pudo crear el relevamiento: ${error?.message ?? 'sin datos'}` }
  return { ok: true, data: { id: data.id } }
}

export async function registrarArchivos(
  relevamientoId: string,
  km: number,
  rutas: string[],
): Promise<ResultadoAccion> {
  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('relevamientos')
    .update({ metadata: { km, archivos: rutas } })
    .eq('id', relevamientoId)

  if (error) return { ok: false, error: `No se pudieron registrar los archivos: ${error.message}` }
  revalidatePath('/dashboard')
  return { ok: true, data: undefined }
}
