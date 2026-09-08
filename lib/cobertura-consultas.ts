import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cacheMunicipio } from './cache'
import { resumirCobertura, type ResumenCobertura } from './cobertura-resumen'
import type { RugosidadTramo } from './sensores/tipos'
import { crearClienteAdmin } from './supabase/admin'
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
    return []
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

/**
 * Techo defensivo de filas leídas de `cobertura_tramos`: evita el límite
 * implícito de PostgREST (1000) en municipios con muchos recorridos.
 */
const LIMITE_COBERTURA_TRAMOS = 20000

/**
 * Igual que `obtenerTramosConEstado`, pero con el cliente ADMIN (sin sesión)
 * para poder envolverse en `unstable_cache` (ver `cacheMunicipio`). El
 * filtro por municipio queda explícito (`eq`) porque el admin omite RLS.
 */
async function obtenerTramosConEstadoAdmin(municipio: string): Promise<TramoConEstado[]> {
  const admin = crearClienteAdmin()
  const { data: tramos, error: errorTramos } = await admin
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
  const { data: cobertura, error: errorCobertura } = await admin
    .from('cobertura_tramos')
    .select('tramo_id')
    .in('tramo_id', ids)
    .limit(LIMITE_COBERTURA_TRAMOS)

  if (errorCobertura) {
    console.error('[cobertura-consultas]', errorCobertura.message)
    return []
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

/**
 * Versión cacheada (120s, tag `municipio:<slug>`) de los tramos con estado,
 * para la carga inicial del mapa. Usa el cliente admin (`obtenerTramosConEstadoAdmin`)
 * porque una función envuelta en `unstable_cache` no puede leer `cookies()`
 * (la sesión) y su resultado se comparte entre pedidos y usuarios del mismo
 * municipio; la RPC `cobertura_municipio`/`rugosidad_tramos` sigue sin
 * cachear y con el cliente del usuario porque no tiene un equivalente simple
 * de "filtro explícito + admin" sin reescribir la función SQL.
 */
export function obtenerTramosConEstadoCacheado(municipio: string): Promise<TramoConEstado[]> {
  return cacheMunicipio('tramos-con-estado', () => obtenerTramosConEstadoAdmin(municipio), municipio)()
}

/**
 * Rugosidad estimada por tramo (calidad predominante, rms y velocidad medias,
 * impactos y segmentos), vía la función SQL `rugosidad_tramos`.
 */
export async function obtenerRugosidadTramos(
  supabase: Cliente,
  municipio: string,
): Promise<Record<string, RugosidadTramo>> {
  const { data, error } = await supabase.rpc('rugosidad_tramos', { p_municipio: municipio })

  if (error) {
    console.error('[rugosidad]', error.message)
    return {}
  }

  const resultado: Record<string, RugosidadTramo> = {}
  for (const fila of data ?? []) {
    resultado[fila.tramo_id] = {
      calidad: fila.calidad,
      rms: Number(fila.rms_medio),
      velocidad: Number(fila.velocidad_media),
      impactos: Number(fila.impactos),
      segmentos: Number(fila.segmentos),
    }
  }
  return resultado
}
