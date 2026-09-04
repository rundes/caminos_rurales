export type OpcionesCompresion = { maxPx: number; calidad: number }

/** Lo mínimo que necesitamos de un `ImageBitmap` para redimensionar. */
export type ImagenDecodificada = {
  width: number
  height: number
  close?: () => void
}

/** Lienzo abstracto: `OffscreenCanvas` en el navegador, un doble en los tests. */
export type Lienzo = {
  dibujar(imagen: ImagenDecodificada, ancho: number, alto: number): void
  aBlob(tipo: string, calidad: number): Promise<Blob | null>
}

export type DepsCompresion = {
  crearBitmap: (archivo: Blob) => Promise<ImagenDecodificada>
  crearCanvas: (ancho: number, alto: number) => Lienzo | null
}

export const OPCIONES_COMPRESION: OpcionesCompresion = { maxPx: 1600, calidad: 0.8 }

/** Por debajo de este tamaño no vale la pena recomprimir una imagen ya chica. */
const TAMANO_SIN_COMPRIMIR_BYTES = 500 * 1024

function crearCanvasNavegador(ancho: number, alto: number): Lienzo | null {
  if (typeof OffscreenCanvas === 'undefined') return null
  const canvas = new OffscreenCanvas(ancho, alto)
  const contexto = canvas.getContext('2d')
  if (!contexto) return null
  return {
    dibujar(imagen, ancho2, alto2) {
      contexto.drawImage(imagen as unknown as CanvasImageSource, 0, 0, ancho2, alto2)
    },
    aBlob(tipo, calidad) {
      return canvas.convertToBlob({ type: tipo, quality: calidad })
    },
  }
}

const DEPS_DEFECTO: DepsCompresion = {
  // `from-image` respeta el EXIF: sin esto las fotos verticales del celular
  // se suben rotadas, porque el canvas ignora la orientación del archivo.
  crearBitmap: (archivo) => createImageBitmap(archivo, { imageOrientation: 'from-image' }),
  crearCanvas: crearCanvasNavegador,
}

function nombreJpg(nombre: string): string {
  const base = nombre.replace(/\.[^.\\/]+$/, '')
  return `${base || 'evidencia'}.jpg`
}

/**
 * Reduce una foto a `maxPx` en su lado mayor y la reencoda como JPEG.
 * Devuelve el archivo original sin tocar si no es una imagen, si ya es chica
 * o si la decodificación falla (la subida nunca debe romperse por esto).
 */
export async function comprimirImagen(
  archivo: File,
  opciones: OpcionesCompresion = OPCIONES_COMPRESION,
  deps: DepsCompresion = DEPS_DEFECTO,
): Promise<File> {
  if (!archivo.type.startsWith('image/')) return archivo

  try {
    const bitmap = await deps.crearBitmap(archivo)
    const ladoMayor = Math.max(bitmap.width, bitmap.height)
    const escala = ladoMayor > 0 ? Math.min(1, opciones.maxPx / ladoMayor) : 1

    if (escala === 1 && archivo.size < TAMANO_SIN_COMPRIMIR_BYTES) {
      bitmap.close?.()
      return archivo
    }

    const ancho = Math.max(1, Math.round(bitmap.width * escala))
    const alto = Math.max(1, Math.round(bitmap.height * escala))
    const lienzo = deps.crearCanvas(ancho, alto)
    if (!lienzo) {
      bitmap.close?.()
      return archivo
    }

    lienzo.dibujar(bitmap, ancho, alto)
    const blob = await lienzo.aBlob('image/jpeg', opciones.calidad)
    bitmap.close?.()
    if (!blob) return archivo

    return new File([blob], nombreJpg(archivo.name), {
      type: 'image/jpeg',
      lastModified: archivo.lastModified,
    })
  } catch (error) {
    console.error('[imagenes]', error)
    return archivo
  }
}
