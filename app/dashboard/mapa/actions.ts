'use server'

import type { Cuadro } from '@/lib/cuadros'
import { obtenerCuadros } from '@/lib/cuadros-consultas'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { ResultadoAccion } from '@/lib/tipos'

const ERROR_SESION = 'Sesión vencida. Volvé a ingresar.'
const ERROR_PERFIL = 'No se pudo cargar tu perfil.'
const ERROR_SIN_MUNICIPIO = 'Tu perfil no tiene un partido asignado.'
const ERROR_CUADROS = 'No se pudieron cargar los cuadros. Intentá de nuevo.'

const SEGUNDOS_URL_FIRMADA = 60 * 60
const LOTE_FIRMA_CUADROS = 100
const BUCKET_EVIDENCIA = 'evidencia-vial'

export type CuadrosMunicipio = { cuadros: Cuadro[]; urls: Record<string, string> }

/**
 * Cuadros de cámara del municipio del usuario logueado, con sus URLs
 * (firmadas si cuelgan de Supabase Storage, directas si ya son `https://`).
 *
 * Server action llamada bajo demanda (al activar el toggle "Cuadros" del
 * mapa): firmar cientos de URLs en cada carga de página, cuando la mayoría
 * de las visitas nunca activa esa capa, es trabajo desperdiciado. Firma en
 * lotes concurrentes (igual que la carga inicial de observaciones) para no
 * mandar miles de rutas en un solo pedido a Storage.
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
    const urls: Record<string, string> = {}
    for (const ruta of rutas) {
      if (ruta.startsWith('https://')) urls[ruta] = ruta
    }

    const rutasASignar = rutas.filter((r) => !r.startsWith('https://'))
    const lotes: string[][] = []
    for (let i = 0; i < rutasASignar.length; i += LOTE_FIRMA_CUADROS) {
      lotes.push(rutasASignar.slice(i, i + LOTE_FIRMA_CUADROS))
    }
    const resultados = await Promise.all(
      lotes.map((lote) => supabase.storage.from(BUCKET_EVIDENCIA).createSignedUrls(lote, SEGUNDOS_URL_FIRMADA)),
    )
    for (const { data: firmadas } of resultados) {
      for (const f of firmadas ?? []) {
        if (f.path && f.signedUrl) urls[f.path] = f.signedUrl
      }
    }

    return { ok: true, data: { cuadros, urls } }
  } catch (error) {
    console.error('[mapa]', error)
    return { ok: false, error: ERROR_CUADROS }
  }
}
