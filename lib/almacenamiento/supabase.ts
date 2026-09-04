import 'server-only'
import { crearClienteServidor } from '@/lib/supabase/server'
import type { DestinoSubida, ProveedorAlmacenamiento } from './tipos'

export const BUCKET_EVIDENCIA = 'evidencia-vial'

const SEGUNDOS_LECTURA = 60 * 60
const CACHE_CONTROL = 'max-age=3600'

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
        .createSignedUrl(rutaOUrl, SEGUNDOS_LECTURA)
      if (error || !data) {
        console.error('[almacenamiento]', error?.message ?? 'sin URL de lectura')
        throw new Error('No se pudo generar el enlace de la evidencia')
      }
      return data.signedUrl
    },
  }
}
