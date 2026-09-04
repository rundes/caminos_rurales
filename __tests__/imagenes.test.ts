import { beforeEach, describe, expect, test, vi } from 'vitest'
import { comprimirImagen, type DepsCompresion, type Lienzo } from '@/lib/imagenes'

function archivo(nombre: string, tipo: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], nombre, { type: tipo })
}

const dibujar = vi.fn()
const aBlob = vi.fn()
const close = vi.fn()
const crearCanvas = vi.fn<DepsCompresion['crearCanvas']>()
const crearBitmap = vi.fn<DepsCompresion['crearBitmap']>()

const lienzo: Lienzo = { dibujar, aBlob }
const deps: DepsCompresion = { crearBitmap, crearCanvas }

beforeEach(() => {
  vi.clearAllMocks()
  crearCanvas.mockReturnValue(lienzo)
  crearBitmap.mockResolvedValue({ width: 4000, height: 3000, close })
  aBlob.mockResolvedValue(new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }))
})

describe('comprimirImagen', () => {
  test('devuelve el archivo intacto si no es una imagen', async () => {
    const video = archivo('clip.mp4', 'video/mp4', 10)
    expect(await comprimirImagen(video, undefined, deps)).toBe(video)
    expect(crearBitmap).not.toHaveBeenCalled()
  })

  test('devuelve el original si ya es chica en píxeles y en bytes', async () => {
    crearBitmap.mockResolvedValue({ width: 800, height: 600, close })
    const foto = archivo('chica.jpg', 'image/jpeg', 1000)
    expect(await comprimirImagen(foto, undefined, deps)).toBe(foto)
    expect(crearCanvas).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalled()
  })

  test('redimensiona al lado mayor conservando la proporción', async () => {
    const foto = archivo('grande.png', 'image/png', 4 * 1024 * 1024)
    const resultado = await comprimirImagen(foto, { maxPx: 1600, calidad: 0.8 }, deps)

    expect(crearCanvas).toHaveBeenCalledWith(1600, 1200)
    expect(dibujar).toHaveBeenCalledWith(expect.objectContaining({ width: 4000 }), 1600, 1200)
    expect(aBlob).toHaveBeenCalledWith('image/jpeg', 0.8)
    expect(resultado.type).toBe('image/jpeg')
    expect(resultado.name).toBe('grande.jpg')
    expect(resultado.size).toBe(1000)
  })

  test('recomprime una imagen chica en píxeles pero pesada', async () => {
    crearBitmap.mockResolvedValue({ width: 1000, height: 1000, close })
    const foto = archivo('pesada.jpg', 'image/jpeg', 900 * 1024)
    const resultado = await comprimirImagen(foto, undefined, deps)
    expect(crearCanvas).toHaveBeenCalledWith(1000, 1000)
    expect(resultado.name).toBe('pesada.jpg')
    expect(resultado.size).toBe(1000)
  })

  test('devuelve el original si falla la decodificación y lo registra', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    crearBitmap.mockRejectedValue(new Error('decode falló'))
    const foto = archivo('rota.jpg', 'image/jpeg', 2 * 1024 * 1024)
    expect(await comprimirImagen(foto, undefined, deps)).toBe(foto)
    expect(spy).toHaveBeenCalledWith('[imagenes]', expect.any(Error))
    spy.mockRestore()
  })

  test('devuelve el original si no hay lienzo disponible', async () => {
    crearCanvas.mockReturnValue(null)
    const foto = archivo('grande.jpg', 'image/jpeg', 4 * 1024 * 1024)
    expect(await comprimirImagen(foto, undefined, deps)).toBe(foto)
  })

  test('devuelve el original si el lienzo no produce blob', async () => {
    aBlob.mockResolvedValue(null)
    const foto = archivo('grande.jpg', 'image/jpeg', 4 * 1024 * 1024)
    expect(await comprimirImagen(foto, undefined, deps)).toBe(foto)
  })
})

describe('deps por defecto', () => {
  test('decodifica respetando la orientacion EXIF del archivo', async () => {
    const createImageBitmap = vi.fn().mockResolvedValue({ width: 4000, height: 3000, close })
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    const foto = archivo('vertical.jpg', 'image/jpeg', 4 * 1024 * 1024)
    // jsdom no tiene OffscreenCanvas: el lienzo por defecto devuelve null y la
    // funcion cae al archivo original, pero la decodificacion ya ocurrio.
    expect(await comprimirImagen(foto)).toBe(foto)
    expect(createImageBitmap).toHaveBeenCalledWith(foto, { imageOrientation: 'from-image' })

    vi.unstubAllGlobals()
  })
})
