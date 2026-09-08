import 'server-only'
import { mapConConcurrencia } from '@/lib/concurrencia'
import { envServidor } from '@/lib/env'
import { parsearCredencialesGcs, type CredencialesGcs } from './gcs-credenciales'
import { SEGUNDOS_LECTURA_EXPIRACION, type DestinoSubida, type ProveedorAlmacenamiento } from './tipos'

const MINUTOS_ESCRITURA = 15

/**
 * Cuántas firmas de lectura se piden en paralelo por lote. GCS no tiene una
 * API de lote como `createSignedUrls` de Supabase: cada ruta se firma con su
 * propio `getSignedUrl`, así que sin este límite un mapa con cientos de
 * cuadros dispararía cientos de promesas de una sola vez.
 */
const CONCURRENCIA_FIRMA_LECTURA = 20

function credenciales(): CredencialesGcs {
  const crudo = envServidor().GCS_SERVICE_ACCOUNT_KEY
  if (!crudo) throw new Error('Falta GCS_SERVICE_ACCOUNT_KEY para usar ALMACENAMIENTO=gcs')
  // `envServidor()` ya validó esta clave al arrancar (ver `lib/env.ts`); este
  // chequeo es defensivo por si algo construye el proveedor sin pasar por ahí.
  const resultado = parsearCredencialesGcs(crudo)
  if (!resultado.ok) throw new Error(resultado.error)
  return resultado.datos
}

function nombreBucket(): string {
  const bucket = envServidor().GCS_BUCKET
  if (!bucket) throw new Error('Falta GCS_BUCKET para usar ALMACENAMIENTO=gcs')
  return bucket
}

async function crearStorage() {
  const { Storage } = await import('@google-cloud/storage')
  return new Storage({ credentials: credenciales() })
}

export function crearProveedorGcs(): ProveedorAlmacenamiento {
  return {
    async prepararSubida(ruta: string, contentType: string): Promise<DestinoSubida> {
      const bucket = nombreBucket()
      const almacenamiento = await crearStorage()
      const [urlSubida] = await almacenamiento
        .bucket(bucket)
        .file(ruta)
        .getSignedUrl({
          version: 'v4',
          action: 'write',
          expires: Date.now() + MINUTOS_ESCRITURA * 60 * 1000,
          contentType,
        })
      return {
        urlSubida,
        metodo: 'PUT',
        headers: { 'content-type': contentType },
        // El objeto todavía no existe y una URL firmada con vencimiento
        // quedaría vieja para cuando se lea de verdad: se guarda la ruta,
        // igual que Supabase, y se firma recién al leer (ver `urlLectura`).
        urlLectura: ruta,
        ruta,
      }
    },

    async urlLectura(rutaOUrl: string): Promise<string> {
      if (rutaOUrl.startsWith('https://')) return rutaOUrl
      try {
        const bucket = nombreBucket()
        const almacenamiento = await crearStorage()
        const [url] = await almacenamiento
          .bucket(bucket)
          .file(rutaOUrl)
          .getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + SEGUNDOS_LECTURA_EXPIRACION * 1000,
          })
        return url
      } catch (error) {
        console.error('[almacenamiento]', error)
        throw new Error('No se pudo generar el enlace de la evidencia')
      }
    },

    async urlsLectura(rutas: readonly string[]): Promise<Record<string, string>> {
      const urls: Record<string, string> = {}
      const aFirmar: string[] = []
      for (const ruta of rutas) {
        if (ruta.startsWith('https://')) urls[ruta] = ruta
        else aFirmar.push(ruta)
      }
      if (aFirmar.length === 0) return urls

      const bucket = nombreBucket()
      const almacenamiento = await crearStorage()
      const expires = Date.now() + SEGUNDOS_LECTURA_EXPIRACION * 1000

      const pares = await mapConConcurrencia(aFirmar, CONCURRENCIA_FIRMA_LECTURA, async (ruta) => {
        try {
          const [url] = await almacenamiento
            .bucket(bucket)
            .file(ruta)
            .getSignedUrl({ version: 'v4', action: 'read', expires })
          return [ruta, url] as const
        } catch (error) {
          // Una ruta que no se puede firmar no tira abajo el resto del lote:
          // igual que Supabase omite del mapa la ruta que no existe.
          console.error('[almacenamiento]', error)
          return null
        }
      })

      for (const par of pares) {
        if (par) urls[par[0]] = par[1]
      }
      return urls
    },
  }
}
