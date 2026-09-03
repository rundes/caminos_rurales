import { validarArchivo } from './archivos'

export const MAX_SEGUNDOS_VIDEO = 15
export const MAX_BYTES_VIDEO = 50 * 1024 * 1024

export const ERROR_VIDEO_LARGO = `El video no puede durar más de ${MAX_SEGUNDOS_VIDEO} segundos.`
export const ERROR_VIDEO_PESADO = 'El video no puede superar los 50 MB.'
export const ERROR_VIDEO_ILEGIBLE = 'No se pudo leer el video. Probá con otro archivo.'

/** Mide la duración de un video en segundos. Inyectable para poder testear. */
export type MedirDuracion = (archivo: Blob) => Promise<number>

/**
 * Lee `duration` de los metadatos del video con un `<video>` fuera del DOM
 * sobre un object URL, que se libera siempre.
 */
export function medirDuracionVideo(archivo: Blob): Promise<number> {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo)
    const video = document.createElement('video')
    video.preload = 'metadata'

    const limpiar = () => {
      video.onloadedmetadata = null
      video.onerror = null
      video.removeAttribute('src')
      URL.revokeObjectURL(url)
    }

    video.onloadedmetadata = () => {
      const duracion = video.duration
      limpiar()
      resolver(Number.isFinite(duracion) ? duracion : 0)
    }
    video.onerror = () => {
      limpiar()
      rechazar(new Error('metadatos ilegibles'))
    }

    video.src = url
  })
}

/**
 * Valida una evidencia antes de guardarla: tipo permitido y, para videos,
 * 50 MB y 15 segundos como máximo. Las imágenes no tienen límite adicional
 * porque se comprimen antes de subirse. Devuelve el mensaje de error o null.
 */
export async function validarEvidencia(
  archivo: File,
  medir: MedirDuracion = medirDuracionVideo,
): Promise<string | null> {
  const errorTipo = validarArchivo(archivo)
  if (errorTipo) return errorTipo
  if (!archivo.type.startsWith('video/')) return null
  if (archivo.size > MAX_BYTES_VIDEO) return ERROR_VIDEO_PESADO

  try {
    const segundos = await medir(archivo)
    if (segundos > MAX_SEGUNDOS_VIDEO) return ERROR_VIDEO_LARGO
  } catch (error) {
    console.error('[evidencia]', error)
    return ERROR_VIDEO_ILEGIBLE
  }

  return null
}
