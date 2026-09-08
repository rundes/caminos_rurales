export const TIPOS_PERMITIDOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const
export const TAMANO_MAXIMO_BYTES = 100 * 1024 * 1024

export function validarArchivo(archivo: File): string | null {
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    return `Tipo no permitido: ${archivo.type || 'desconocido'}. Usá JPG, PNG, WebP, MP4, MOV o WebM.`
  }
  if (archivo.size > TAMANO_MAXIMO_BYTES) {
    return 'El archivo supera los 100 MB.'
  }
  return null
}

function limpiarNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

/**
 * El `id` termina crudo en la ruta de almacenamiento: sin sanear, un `/` o un
 * `..` colado (aunque la validación de arriba en la cadena debiera rechazarlo
 * antes) escribiría fuera del prefijo `{uid}/{recorridoId}/` que las
 * políticas verifican. Defensa en profundidad, no la única barrera.
 */
function sanitizarId(id: string | number): string {
  return String(id).replace(/[^A-Za-z0-9-]+/g, '-')
}

/**
 * Ruta de la evidencia en el almacenamiento. Con el `id` de la observación la
 * ruta es determinística: un reintento de subida pisa el mismo objeto en vez
 * de dejar copias huérfanas. Sin `id` cae al timestamp.
 */
export function rutaEvidencia(
  uid: string,
  recorridoId: string,
  nombre: string,
  id: string | number = Date.now(),
): string {
  return `${uid}/${recorridoId}/${sanitizarId(id)}-${limpiarNombre(nombre)}`
}
