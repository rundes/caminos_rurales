'use server'

import { revalidatePath } from 'next/cache'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'
import { esquemaCamino, primerError } from '@/lib/validaciones'

export type EstadoAccionCamino = ResultadoAccion | undefined

export async function crearCamino(_prev: EstadoAccionCamino, formData: FormData): Promise<EstadoAccionCamino> {
  const parseo = esquemaCamino.safeParse({ nombre_codigo: formData.get('nombre_codigo') })
  if (!parseo.success) return { ok: false, error: primerError(parseo.error) }

  const supabase = await crearClienteServidor()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Sesión vencida. Volvé a ingresar.' }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('municipio_id, rol')
    .eq('id', user.id)
    .single()
  if (errorPerfil || !perfil) return { ok: false, error: 'No se encontró tu perfil' }

  const { error } = await supabase
    .from('caminos')
    .insert({ nombre_codigo: parseo.data.nombre_codigo, municipio: perfil.municipio_id })

  if (error) {
    if (error.message.includes('row-level security')) {
      return { ok: false, error: 'No tenés permiso para crear caminos. Pedí el rol municipio o auditor.' }
    }
    return { ok: false, error: `No se pudo crear el camino: ${error.message}` }
  }

  revalidatePath('/dashboard/caminos')
  return { ok: true, data: undefined }
}
