import 'server-only'
import { PREFIJO_GCS, type DestinoSubida, type ProveedorAlmacenamiento } from './tipos'

const MINUTOS_ESCRITURA = 15

function credenciales(): Record<string, unknown> {
  const crudo = process.env.GCS_SERVICE_ACCOUNT_KEY
  if (!crudo) throw new Error('Falta GCS_SERVICE_ACCOUNT_KEY para usar ALMACENAMIENTO=gcs')
  try {
    return JSON.parse(crudo) as Record<string, unknown>
  } catch (error) {
    console.error('[almacenamiento]', error)
    throw new Error('GCS_SERVICE_ACCOUNT_KEY no contiene un JSON válido')
  }
}

function nombreBucket(): string {
  const bucket = process.env.GCS_BUCKET
  if (!bucket) throw new Error('Falta GCS_BUCKET para usar ALMACENAMIENTO=gcs')
  return bucket
}

function urlPublica(bucket: string, ruta: string): string {
  return `${PREFIJO_GCS}${bucket}/${ruta}`
}

export function crearProveedorGcs(): ProveedorAlmacenamiento {
  return {
    async prepararSubida(ruta: string, contentType: string): Promise<DestinoSubida> {
      const bucket = nombreBucket()
      const { Storage } = await import('@google-cloud/storage')
      const almacenamiento = new Storage({ credentials: credenciales() })
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
        urlLectura: urlPublica(bucket, ruta),
        ruta,
      }
    },

    async urlLectura(rutaOUrl: string): Promise<string> {
      if (rutaOUrl.startsWith('https://')) return rutaOUrl
      return urlPublica(nombreBucket(), rutaOUrl)
    },
  }
}
