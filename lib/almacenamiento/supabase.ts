import 'server-only'
import { enLotes, mapConConcurrencia } from '@/lib/concurrencia'
import { crearClienteServidor } from '@/lib/supabase/server'
import { SEGUNDOS_LECTURA_EXPIRACION, type DestinoSubida, type ProveedorAlmacenamiento } from './tipos'

export const BUCKET_EVIDENCIA = 'evidencia-vial'

const CACHE_CONTROL = 'max-age=3600'

/** Rutas por pedido de `createSignedUrls` (tope alto documentado por Supabase). */
const TAMANO_LOTE_FIRMA = 100
/** Pedidos de lote en simultáneo, para no disparar todos de una si hay muchos lotes. */
const CONCURRENCIA_LOTES_FIRMA = 6

/**
 * Cabeceras equivalentes a las que manda `uploadToSignedUrl` de supabase-js
 * para un cuerpo binario: el token viaja en la query de `signedUrl`, así que
 * la autorización de la subida no depende de estas cabeceras.
 */
function cabeceras(contentType: string): Record<string, string> {
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  return {
    'content-type': contentType,
    'cache-control': CACHE_CONTROL,
    'x-upsert': 'false',
    apikey: clave,
    authorization: `Bearer ${clave}`,
  }
}

export function crearProveedorSupabase(): ProveedorAlmacenamiento {
  return {
    async prepararSubida(ruta: string, contentType: string): Promise<DestinoSubida> {
      const supabase = await crearClienteServidor()
      const { data, error } = await supabase.storage.from(BUCKET_EVIDENCIA).createSignedUploadUrl(ruta)
      if (error || !data) {
        console.error('[almacenamiento]', error?.message ?? 'sin URL firmada')
        throw new Error('No se pudo preparar la subida de la evidencia')
      }
      return {
        urlSubida: data.signedUrl,
        metodo: 'PUT',
        headers: cabeceras(contentType),
        urlLectura: ruta,
        ruta,
      }
    },

    async urlLectura(rutaOUrl: string): Promise<string> {
      if (rutaOUrl.startsWith('https://')) return rutaOUrl
      const supabase = await crearClienteServidor()
      const { data, error } = await supabase.storage
        .from(BUCKET_EVIDENCIA)
        .createSignedUrl(rutaOUrl, SEGUNDOS_LECTURA_EXPIRACION)
      if (error || !data) {
        console.error('[almacenamiento]', error?.message ?? 'sin URL de lectura')
        throw new Error('No se pudo generar el enlace de la evidencia')
      }
      return data.signedUrl
    },

    async urlsLectura(rutas: readonly string[]): Promise<Record<string, string>> {
      const urls: Record<string, string> = {}
      const aFirmar: string[] = []
      for (const ruta of rutas) {
        if (ruta.startsWith('https://')) urls[ruta] = ruta
        else aFirmar.push(ruta)
      }
      if (aFirmar.length === 0) return urls

      const supabase = await crearClienteServidor()
      const lotes = enLotes(aFirmar, TAMANO_LOTE_FIRMA)
      const resultados = await mapConConcurrencia(lotes, CONCURRENCIA_LOTES_FIRMA, (lote) =>
        supabase.storage.from(BUCKET_EVIDENCIA).createSignedUrls(lote, SEGUNDOS_LECTURA_EXPIRACION),
      )
      for (const { data, error } of resultados) {
        if (error) console.error('[almacenamiento]', error.message)
        for (const f of data ?? []) {
          if (f.path && f.signedUrl) urls[f.path] = f.signedUrl
        }
      }
      return urls
    },
  }
}
