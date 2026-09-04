import { describe, expect, test, vi } from 'vitest'
import {
  capturarCuadro,
  debeDisparar,
  ERROR_SIN_CONTEXTO,
  ERROR_SIN_VIDEO,
  normalizarRumbo,
  normalizarVelocidad,
  type DepsCaptura,
  type LienzoCaptura,
  type PuntoCuadro,
} from '@/lib/camara/captura'
import {
  ANCHO_CUADRO_PX,
  CALIDAD_JPEG,
  DISTANCIA_CUADRO_M,
  INTERVALO_CUADRO_MS,
} from '@/lib/camara/umbrales'

const T0 = 1_700_000_000_000
const ORIGEN = { lat: -36.85, lng: -57.88, t: T0 }

/** Punto a `metros` al norte del origen, `ms` después. */
function punto(metros: number, ms: number, velocidadKmh: number | null = 40): PuntoCuadro {
  return {
    lat: ORIGEN.lat + metros / 111_320,
    lng: ORIGEN.lng,
    t: T0 + ms,
    velocidadKmh,
  }
}

/** Canvas falso: jsdom no implementa `getContext` ni `toBlob`. */
function crearDepsCanvas(blob: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' })) {
  const dibujado: unknown[] = []
  const codificado: { tipo?: string; calidad?: number }[] = []
  const tamanos: { ancho: number; alto: number }[] = []

  const deps: DepsCaptura = {
    crearCanvas: (ancho, alto) => {
      tamanos.push({ ancho, alto })
      const lienzo: LienzoCaptura = {
        width: ancho,
        height: alto,
        getContext: () => ({
          drawImage: (fuente, x, y, w, h) => dibujado.push({ fuente, x, y, w, h }),
        }),
        toBlob: (callback, tipo, calidad) => {
          codificado.push({ tipo, calidad })
          callback(blob)
        },
      }
      return lienzo
    },
  }

  return { deps, dibujado, codificado, tamanos }
}

describe('debeDisparar', () => {
  test('el primer cuadro del recorrido siempre se saca', () => {
    expect(debeDisparar(null, punto(0, 0))).toBe(true)
  })

  test('dispara al recorrer la distancia mínima', () => {
    expect(debeDisparar(ORIGEN, punto(DISTANCIA_CUADRO_M - 5, 1000))).toBe(false)
    expect(debeDisparar(ORIGEN, punto(DISTANCIA_CUADRO_M + 5, 1000))).toBe(true)
  })

  test('sin distancia dispara por tiempo solo si se va rápido', () => {
    expect(debeDisparar(ORIGEN, punto(10, INTERVALO_CUADRO_MS, 40))).toBe(true)
    expect(debeDisparar(ORIGEN, punto(10, INTERVALO_CUADRO_MS, 5))).toBe(false)
    expect(debeDisparar(ORIGEN, punto(10, INTERVALO_CUADRO_MS - 1, 40))).toBe(false)
  })

  test('sin velocidad informada no dispara por tiempo', () => {
    expect(debeDisparar(ORIGEN, punto(10, INTERVALO_CUADRO_MS, null))).toBe(false)
  })

  test('respeta los umbrales que se le pasen', () => {
    const umbrales = { distanciaM: 10, intervaloMs: 1000, velocidadMinimaKmh: 1 }
    expect(debeDisparar(ORIGEN, punto(15, 100, 0), umbrales)).toBe(true)
  })
})

describe('normalizar', () => {
  test('deja en null la velocidad ausente o fuera de rango', () => {
    expect(normalizarVelocidad(40)).toBe(40)
    expect(normalizarVelocidad(null)).toBeNull()
    expect(normalizarVelocidad(-1)).toBeNull()
    expect(normalizarVelocidad(1000)).toBeNull()
    expect(normalizarVelocidad(Number.NaN)).toBeNull()
  })

  test('deja en null el rumbo ausente o fuera de rango', () => {
    expect(normalizarRumbo(90)).toBe(90)
    expect(normalizarRumbo(Number.NaN)).toBeNull()
    expect(normalizarRumbo(400)).toBeNull()
    expect(normalizarRumbo(undefined)).toBeNull()
  })
})

describe('capturarCuadro', () => {
  test('reescala a 1280 de ancho conservando la relación de aspecto', async () => {
    const { deps, dibujado, codificado, tamanos } = crearDepsCanvas()

    const blob = await capturarCuadro({ videoWidth: 1920, videoHeight: 1080 }, deps)

    expect(tamanos).toEqual([{ ancho: ANCHO_CUADRO_PX, alto: 720 }])
    expect(dibujado).toHaveLength(1)
    expect(codificado).toEqual([{ tipo: 'image/jpeg', calidad: CALIDAD_JPEG }])
    expect(blob.type).toBe('image/jpeg')
  })

  test('no agranda un video más chico que el ancho objetivo', async () => {
    const { deps, tamanos } = crearDepsCanvas()

    await capturarCuadro({ videoWidth: 640, videoHeight: 480 }, deps)

    expect(tamanos).toEqual([{ ancho: 640, alto: 480 }])
  })

  test('falla si el video todavía no tiene imagen', async () => {
    const { deps } = crearDepsCanvas()

    await expect(capturarCuadro({ videoWidth: 0, videoHeight: 0 }, deps)).rejects.toThrow(
      ERROR_SIN_VIDEO,
    )
  })

  test('falla si el navegador no da contexto 2d', async () => {
    const deps: DepsCaptura = {
      crearCanvas: (ancho, alto) => ({
        width: ancho,
        height: alto,
        getContext: () => null,
        toBlob: vi.fn(),
      }),
    }

    await expect(capturarCuadro({ videoWidth: 1280, videoHeight: 720 }, deps)).rejects.toThrow(
      ERROR_SIN_CONTEXTO,
    )
  })

  test('falla si el canvas no devuelve imagen', async () => {
    const { deps } = crearDepsCanvas(null)

    await expect(capturarCuadro({ videoWidth: 1280, videoHeight: 720 }, deps)).rejects.toThrow(
      ERROR_SIN_VIDEO,
    )
  })
})
