import { valorParaGuardar } from '@/lib/almacenamiento/tipos'
import type { DepsSincronizacion } from './deps'
import type { ObservacionLocal, TipoEvidencia } from './tipos'

function tipoEvidencia(contentType: string): TipoEvidencia {
  return contentType.startsWith('video/') ? 'video' : 'imagen'
}

/**
 * Sube la evidencia de una observación y deja guardada la ruta resultante. Las
 * imágenes se comprimen antes; los videos van tal cual. Una observación ya
 * subida no se vuelve a mandar.
 */
export async function subirEvidencia(
  observacion: ObservacionLocal,
  deps: DepsSincronizacion,
): Promise<ObservacionLocal> {
  const blob = observacion.archivo
  if (!blob || observacion.estadoSubida === 'subida') return observacion

  const nombre = observacion.nombreArchivo ?? `${observacion.id}.jpg`
  const tipoOriginal = observacion.tipoArchivo ?? blob.type ?? 'image/jpeg'
  const original = new File([blob], nombre, { type: tipoOriginal })
  const archivo = tipoOriginal.startsWith('image/') ? await deps.comprimir(original) : original

  // El id de la observación hace la ruta determinística: un reintento pisa el
  // mismo objeto en vez de dejar copias huérfanas en el bucket.
  const preparada = await deps.prepararSubida(
    observacion.recorridoId,
    archivo.name,
    archivo.type,
    observacion.id,
  )
  if (!preparada.ok) throw new Error(preparada.error)

  await deps.subir(preparada.data, archivo)

  const subida: ObservacionLocal = {
    ...observacion,
    archivo: undefined,
    evidencia: { ruta: valorParaGuardar(preparada.data), tipo: tipoEvidencia(archivo.type) },
    estadoSubida: 'subida',
  }
  await deps.db.guardarObservacion(subida)
  return subida
}
