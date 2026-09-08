import 'server-only'
import { cacheMunicipio } from './cache'
import { crearClienteAdmin } from './supabase/admin'

export type TramoResumen = {
  id: string
  nombre_codigo: string
  localidad: string
  km: number
  veces: number
  ultimaVisita: string | null
  cuadros: number
}

/**
 * Techo defensivo de filas leídas de `cobertura_tramos`/`cuadros`: evita el
 * límite implícito de PostgREST (1000) en municipios con muchos recorridos
 * (mismo criterio que `lib/cobertura-consultas.ts`).
 */
const LIMITE_COBERTURA = 20000
const LIMITE_CUADROS = 20000

/**
 * Resumen por tramo del municipio (km, veces cubierto, última visita y
 * cantidad de cuadros de cámara), para la lista "Tramos". Con el cliente
 * ADMIN y `eq('municipio', …)` explícito (sin `cookies()`/RLS) para poder
 * envolverse en `unstable_cache` — mismo patrón que
 * `obtenerTramosConEstadoAdmin` en `cobertura-consultas.ts`.
 */
async function obtenerTramosResumenAdmin(municipio: string): Promise<TramoResumen[]> {
  const admin = crearClienteAdmin()
  const { data: tramos, error: errorTramos } = await admin
    .from('tramos')
    .select('id, nombre_codigo, localidad, km')
    .eq('municipio', municipio)

  if (errorTramos) {
    console.error('[tramos-consultas]', errorTramos.message)
    return []
  }

  const filas = tramos ?? []
  if (filas.length === 0) return []
  const ids = filas.map((t) => t.id)

  const [{ data: cobertura, error: errorCobertura }, { data: cuadros, error: errorCuadros }] = await Promise.all([
    admin.from('cobertura_tramos').select('tramo_id, created_at').in('tramo_id', ids).limit(LIMITE_COBERTURA),
    admin.from('cuadros').select('tramo_id').in('tramo_id', ids).limit(LIMITE_CUADROS),
  ])

  if (errorCobertura) console.error('[tramos-consultas]', errorCobertura.message)
  if (errorCuadros) console.error('[tramos-consultas]', errorCuadros.message)

  const veces = new Map<string, number>()
  const ultimaVisita = new Map<string, string>()
  for (const fila of cobertura ?? []) {
    veces.set(fila.tramo_id, (veces.get(fila.tramo_id) ?? 0) + 1)
    const actual = ultimaVisita.get(fila.tramo_id)
    if (!actual || fila.created_at > actual) ultimaVisita.set(fila.tramo_id, fila.created_at)
  }

  const cuadrosPorTramo = new Map<string, number>()
  for (const fila of cuadros ?? []) {
    if (!fila.tramo_id) continue
    cuadrosPorTramo.set(fila.tramo_id, (cuadrosPorTramo.get(fila.tramo_id) ?? 0) + 1)
  }

  return filas.map((t) => ({
    id: t.id,
    nombre_codigo: t.nombre_codigo,
    localidad: t.localidad,
    km: Number(t.km),
    veces: veces.get(t.id) ?? 0,
    ultimaVisita: ultimaVisita.get(t.id) ?? null,
    cuadros: cuadrosPorTramo.get(t.id) ?? 0,
  }))
}

/**
 * Versión cacheada (120s, tag `municipio:<slug>`) del resumen por tramo, para
 * la lista "Tramos". El estado estimado (rugosidad) no se cachea acá: sigue
 * siendo la RPC `rugosidad_tramos` con el cliente de sesión (ver
 * `obtenerRugosidadTramos` en `cobertura-consultas.ts`), porque no tiene un
 * equivalente simple de "filtro explícito + admin".
 */
export function obtenerTramosResumenCacheado(municipio: string): Promise<TramoResumen[]> {
  return cacheMunicipio('tramos-resumen', () => obtenerTramosResumenAdmin(municipio), municipio)()
}
