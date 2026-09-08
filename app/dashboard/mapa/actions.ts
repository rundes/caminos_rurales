'use server'

import { obtenerProveedor } from '@/lib/almacenamiento'
import type { Cuadro } from '@/lib/cuadros'
import { obtenerCuadros } from '@/lib/cuadros-consultas'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'

const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_PERFIL = 'No se pudo cargar tu perfil.'
const ERROR_SIN_MUNICIPIO = 'Tu perfil no tiene un partido asignado.'
const ERROR_CUADROS = 'No se pudieron cargar los cuadros. Intentá de nuevo.'

export type CuadrosMunicipio = { cuadros: Cuadro[]; urls: Record<string, string> }

/**
 * Cuadros de cámara del municipio del usuario logueado, con sus URLs
 * (firmadas por el proveedor de almacenamiento activo, directas si ya son
 * `https://`).
 *
 * Server action llamada bajo demanda (al activar el toggle "Cuadros" del
 * mapa): firmar cientos de URLs en cada carga de página, cuando la mayoría
 * de las visitas nunca activa esa capa, es trabajo desperdiciado. La firma en
 * lote real (agrupar rutas, acotar la concurrencia) vive en
 * `ProveedorAlmacenamiento.urlsLectura` (ver `lib/almacenamiento/{supabase,gcs}.ts`
 * y `lib/concurrencia.ts`), así que acá no hay que reimplementarla ni conocer
 * el bucket: esta acción funciona igual con Supabase o GCS como proveedor.
 */
export async function obtenerCuadrosMunicipio(): Promise<ResultadoAccion<CuadrosMunicipio>> {
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
    console.error('[mapa]', errorPerfil.message)
    return { ok: false, error: ERROR_PERFIL }
  }
  if (!perfil?.municipio_id) return { ok: false, error: ERROR_SIN_MUNICIPIO }

  try {
    const cuadros = await obtenerCuadros(supabase, perfil.municipio_id)
    const rutas = [...new Set(cuadros.map((c) => c.ruta))]
    const urls = rutas.length > 0 ? await obtenerProveedor().urlsLectura(rutas) : {}

    return { ok: true, data: { cuadros, urls } }
  } catch (error) {
    console.error('[mapa]', error)
    return { ok: false, error: ERROR_CUADROS }
  }
}
