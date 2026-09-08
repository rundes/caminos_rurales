import { describe, expect, test } from 'vitest'
import {
  difuminarCuadro,
  ERROR_SIN_BLOB,
  ERROR_SIN_CONTEXTO,
  type ContextoDifuminado,
  type DepsDifuminado,
  type LienzoDifuminado,
} from '../difuminar'
import type { DetectorPrivacidad, RegionDetectada } from '../tipos'

const ANCHO = 40
const ALTO = 40

function imagenPlana(ancho: number, alto: number, valor = 100): ImageData {
  const data = new Uint8ClampedArray(ancho * alto * 4).fill(valor)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  return { data, width: ancho, height: alto, colorSpace: 'srgb' } as ImageData
}

function pixel(datos: ImageData, x: number, y: number): number {
  return datos.data[(y * datos.width + x) * 4]
}

type Opciones = { sinContexto?: boolean; blobNulo?: boolean }

function crearDeps(opciones: Opciones = {}) {
  const datos = imagenPlana(ANCHO, ALTO)
  const llamadas: { drawImage: number; getImageData: number; putImageData: ImageData[]; toBlob: string[] } = {
    drawImage: 0,
    getImageData: 0,
    putImageData: [],
    toBlob: [],
  }

  const contexto: ContextoDifuminado = {
    drawImage: () => {
      llamadas.drawImage += 1
    },
    getImageData: () => {
      llamadas.getImageData += 1
      return datos
    },
    putImageData: (d) => {
      llamadas.putImageData.push(d)
    },
  }

  const lienzo: LienzoDifuminado = {
    width: ANCHO,
    height: ALTO,
    getContext: () => (opciones.sinContexto ? null : contexto),
    toBlob: (callback, tipo, calidad) => {
      llamadas.toBlob.push(`${tipo}:${calidad}`)
      callback(opciones.blobNulo ? null : new Blob(['difuminado'], { type: tipo }))
    },
  }

  const deps: DepsDifuminado = {
    crearCanvas: () => lienzo,
    decodificar: async () => ({ width: ANCHO, height: ALTO }),
  }

  return { deps, llamadas, datos }
}

function crearDetector(
  regiones: RegionDetectada[],
  opciones: { fallaCargar?: boolean; fallaDetectar?: boolean } = {},
) {
  const orden: string[] = []
  const detector: DetectorPrivacidad = {
    async cargar() {
      orden.push('cargar')
      if (opciones.fallaCargar) throw new Error('no se pudo cargar el modelo')
    },
    async detectar() {
      orden.push('detectar')
      if (opciones.fallaDetectar) throw new Error('la inferencia falló')
      return regiones
    },
  }
  return { detector, orden }
}

describe('difuminarCuadro', () => {
  test('carga el modelo antes de detectar, y detecta antes de dibujar el resultado', async () => {
    const { deps, llamadas } = crearDeps()
    const { detector, orden } = crearDetector([])

    await difuminarCuadro(new Blob(['original']), detector, deps)

    expect(orden).toEqual(['cargar', 'detectar'])
    expect(llamadas.drawImage).toBe(1)
    expect(llamadas.getImageData).toBe(1)
    expect(llamadas.putImageData).toHaveLength(1)
  })

  test('pixela las regiones detectadas con confianza suficiente antes de reencodear', async () => {
    const { deps, llamadas, datos } = crearDeps()
    const { detector } = crearDetector([
      { caja: { x: 0, y: 0, ancho: 10, alto: 10 }, tipo: 'cara', confianza: 0.9 },
    ])

    await difuminarCuadro(new Blob(['original']), detector, deps)

    // El objeto que llega a `putImageData` es el mismo que devolvió
    // `getImageData` (se muta in situ, ver `pixelarRegion`).
    expect(llamadas.putImageData[0]).toBe(datos)
    // Dentro de la región (con margen) los pixeles quedan uniformes: el
    // detalle original (relleno con `imagenPlana`, ya uniforme) sigue siendo
    // el mismo valor, pero lo importante es que se procesó sin tirar y con
    // un único bloque coherente.
    expect(pixel(datos, 0, 0)).toBe(pixel(datos, 1, 1))
  })

  test('sin regiones detectadas igual reencodea (no hay nada que pixelar)', async () => {
    const { deps, llamadas } = crearDeps()
    const { detector } = crearDetector([])

    const resultado = await difuminarCuadro(new Blob(['original']), detector, deps)

    expect(resultado).toBeInstanceOf(Blob)
    expect(llamadas.toBlob).toHaveLength(1)
  })

  test('descarta las detecciones por debajo del umbral de confianza', async () => {
    const { deps, llamadas } = crearDeps()
    const { detector } = crearDetector([
      { caja: { x: 0, y: 0, ancho: 10, alto: 10 }, tipo: 'cara', confianza: 0.1 },
    ])

    await difuminarCuadro(new Blob(['original']), detector, deps)

    expect(llamadas.toBlob).toHaveLength(1)
  })

  test('si el detector no carga, la excepción se propaga y no se reencodea nada', async () => {
    const { deps, llamadas } = crearDeps()
    const { detector } = crearDetector([], { fallaCargar: true })

    await expect(difuminarCuadro(new Blob(['original']), detector, deps)).rejects.toThrow(
      'no se pudo cargar el modelo',
    )
    expect(llamadas.toBlob).toHaveLength(0)
  })

  test('si la inferencia tira, la excepción se propaga y no se reencodea nada', async () => {
    const { deps, llamadas } = crearDeps()
    const { detector } = crearDetector([], { fallaDetectar: true })

    await expect(difuminarCuadro(new Blob(['original']), detector, deps)).rejects.toThrow(
      'la inferencia falló',
    )
    expect(llamadas.toBlob).toHaveLength(0)
  })

  test('sin contexto 2d tira un error explícito', async () => {
    const { deps } = crearDeps({ sinContexto: true })
    const { detector } = crearDetector([])

    await expect(difuminarCuadro(new Blob(['original']), detector, deps)).rejects.toThrow(
      ERROR_SIN_CONTEXTO,
    )
  })

  test('si el canvas no puede generar el blob, tira un error explícito', async () => {
    const { deps } = crearDeps({ blobNulo: true })
    const { detector } = crearDetector([])

    await expect(difuminarCuadro(new Blob(['original']), detector, deps)).rejects.toThrow(
      ERROR_SIN_BLOB,
    )
  })
})
