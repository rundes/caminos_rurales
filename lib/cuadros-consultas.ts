import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cuadro } from './cuadros'
import type { Database } from './supabase/database.types'

type Cliente = SupabaseClient<Database>

const LIMITE_POR_DEFECTO = 3000

/**
 * Últimos cuadros de cámara del municipio, vía `cuadros`. Filtra explícitamente
 * por `recorridos.municipio` (join `!inner`) además de confiar en la política
 * RLS: ordena por `t` descendente y corta en `limite`.
 */
export async function obtenerCuadros(
  supabase: Cliente,
  municipio: string,
  limite = LIMITE_POR_DEFECTO,
): Promise<Cuadro[]> {
  const { data, error } = await supabase
    .from('cuadros')
    .select('id, recorrido_id, tramo_id, t, latitud, longitud, rumbo, velocidad_kmh, ruta, recorridos!inner(municipio)')
    .eq('recorridos.municipio', municipio)
    .order('t', { ascending: false })
    .limit(limite)

  if (error) {
    console.error('[cuadros]', error.message)
    return []
  }

  return (data ?? []).map((c) => ({
    id: c.id,
    recorrido_id: c.recorrido_id,
    tramo_id: c.tramo_id,
    t: c.t,
    lat: Number(c.latitud),
    lng: Number(c.longitud),
    rumbo: c.rumbo === null ? null : Number(c.rumbo),
    velocidadKmh: c.velocidad_kmh === null ? null : Number(c.velocidad_kmh),
    ruta: c.ruta,
  }))
}

/** Cantidad de cuadros por tramo del municipio, vía la función SQL `cuadros_por_tramo`. */
export async function obtenerCuadrosPorTramo(supabase: Cliente, municipio: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('cuadros_por_tramo', { p_municipio: municipio })

  if (error) {
    console.error('[cuadros]', error.message)
    return {}
  }

  const resultado: Record<string, number> = {}
  for (const fila of data ?? []) {
    resultado[fila.tramo_id] = Number(fila.cuadros)
  }
  return resultado
}
