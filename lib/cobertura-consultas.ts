import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resumirCobertura, type ResumenCobertura } from './cobertura-resumen'
import type { Database } from './supabase/database.types'

type Cliente = SupabaseClient<Database>

/** Cobertura del municipio (por localidad y total), vía la función SQL `cobertura_municipio`. */
export async function obtenerCoberturaMunicipio(supabase: Cliente, municipio: string): Promise<ResumenCobertura> {
  const { data, error } = await supabase.rpc('cobertura_municipio', { p_municipio: municipio })

  if (error) {
    console.error('[cobertura-consultas]', error.message)
    return resumirCobertura([])
  }

  return resumirCobertura(data ?? [])
}

export type FilaRanking = { usuario_id: string; nombre: string; puntos: number; posicion: number }

/** Ranking de puntos del municipio, vía la función SQL `ranking_municipio`. */
export async function obtenerRanking(supabase: Cliente, municipio: string): Promise<FilaRanking[]> {
  const { data, error } = await supabase.rpc('ranking_municipio', { p_municipio: municipio })

  if (error) {
    console.error('[cobertura-consultas]', error.message)
    return []
  }

  return (data ?? []).map((f) => ({
    usuario_id: f.usuario_id,
    nombre: f.nombre,
    puntos: Number(f.puntos),
    posicion: Number(f.posicion),
  }))
}

export type LogroPropio = { codigo: string; otorgado_at: string }

/** Insignias ya obtenidas por el usuario. */
export async function obtenerLogrosPropios(supabase: Cliente, userId: string): Promise<LogroPropio[]> {
  const { data, error } = await supabase.from('logros').select('codigo, otorgado_at').eq('usuario_id', userId)

  if (error) {
    console.error('[cobertura-consultas]', error.message)
    return []
  }

  return data ?? []
}

export type TramoConEstado = {
  id: string
  nombre_codigo: string
  localidad: string
  km: number
  geometria: [number, number][]
  veces: number
}

/**
 * Tramos del municipio con la cantidad de veces que cada uno fue cubierto,
 * cruzando `tramos` con `cobertura_tramos` (dos consultas, merge en JS).
 */
export async function obtenerTramosConEstado(supabase: Cliente, municipio: string): Promise<TramoConEstado[]> {
  const { data: tramos, error: errorTramos } = await supabase
    .from('tramos')
    .select('id, nombre_codigo, localidad, km, geometria')
    .eq('municipio', municipio)

  if (errorTramos) {
    console.error('[cobertura-consultas]', errorTramos.message)
    return []
  }

  const filas = tramos ?? []
  if (filas.length === 0) return []

  const ids = filas.map((t) => t.id)
  const { data: cobertura, error: errorCobertura } = await supabase
    .from('cobertura_tramos')
    .select('tramo_id')
    .in('tramo_id', ids)

  if (errorCobertura) {
    console.error('[cobertura-consultas]', errorCobertura.message)
  }

  const veces = new Map<string, number>()
  for (const fila of cobertura ?? []) {
    veces.set(fila.tramo_id, (veces.get(fila.tramo_id) ?? 0) + 1)
  }

  return filas.map((t) => ({
    id: t.id,
    nombre_codigo: t.nombre_codigo,
    localidad: t.localidad,
    km: Number(t.km),
    geometria: t.geometria as [number, number][],
    veces: veces.get(t.id) ?? 0,
  }))
}
