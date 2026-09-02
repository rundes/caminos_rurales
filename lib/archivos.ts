export const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'] as const
export const TAMANO_MAXIMO_BYTES = 100 * 1024 * 1024

export function validarArchivo(archivo: File): string | null {
  if (!(TIPOS_PERMITIDOS as readonly string[]).includes(archivo.type)) {
    return `Tipo no permitido: ${archivo.type || 'desconocido'}. Usá JPG, PNG, WebP, MP4 o MOV.`
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

export function rutaEvidencia(uid: string, relevamientoId: string, nombre: string, ahora = Date.now()): string {
  return `${uid}/${relevamientoId}/${ahora}-${limpiarNombre(nombre)}`
}
