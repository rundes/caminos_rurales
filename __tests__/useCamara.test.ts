import 'fake-indexeddb/auto'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useCamara } from '@/hooks/useCamara'
import { DISTANCIA_CUADRO_M } from '@/lib/camara/umbrales'
import * as db from '@/lib/local/db'

const RECORRIDO = '11111111-1111-4111-8111-111111111111'
const T0 = 1_700_000_000_000
const ORIGEN = { lat: -36.85, lng: -57.88 }

function punto(metros: number, ms: number) {
  return {
    lat: ORIGEN.lat + metros / 111_320,
    lng: ORIGEN.lng,
    t: T0 + ms,
    velocidadKmh: 40,
    rumbo: 90,
  }
}

function crearStream(): { stream: MediaStream; detener: ReturnType<typeof vi.fn> } {
  const detener = vi.fn()
  const stream = { getTracks: () => [{ stop: detener }] } as unknown as MediaStream
  return { stream, detener }
}

function stubCamara(getUserMedia: () => Promise<MediaStream>): void {
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn(getUserMedia) },
  })
}

/** Video falso con imagen: el `<video>` real no existe en un `renderHook`. */
function engancharVideo(videoRef: { current: HTMLVideoElement | null }): void {
  const video = document.createElement('video')
  Object.defineProperty(video, 'videoWidth', { value: 1280 })
  Object.defineProperty(video, 'videoHeight', { value: 720 })
  videoRef.current = video
}

beforeEach(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  // jsdom no implementa el canvas: se falsea el dibujo y la codificación.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
    callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
  )

  await db.cerrarDb()
  await new Promise<void>((resolver) => {
    const peticion = indexedDB.deleteDatabase('visiovial')
    peticion.onsuccess = () => resolver()
    peticion.onerror = () => resolver()
    peticion.onblocked = () => resolver()
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('useCamara', () => {
  test('arranca inactiva y no captura antes de tener permiso', async () => {
    const { stream } = crearStream()
    stubCamara(async () => stream)
    const { result } = renderHook(() => useCamara())

    expect(result.current.estado).toBe('inactiva')

    let capturo: boolean | null = null
    await act(async () => {
      capturo = await result.current.capturarSi(punto(0, 0), RECORRIDO)
    })

    expect(capturo).toBe(false)
    expect(await db.listarCuadros(RECORRIDO)).toEqual([])
  })

  test('sin cámara en el dispositivo queda no disponible', async () => {
    vi.stubGlobal('navigator', { ...navigator, mediaDevices: undefined })
    const { result } = renderHook(() => useCamara())

    await act(async () => {
      expect(await result.current.solicitarPermiso()).toBe(false)
    })

    expect(result.current.estado).toBe('no_disponible')
  })

  test('un permiso rechazado deja la cámara sin permiso y el recorrido sigue', async () => {
    stubCamara(async () => {
      throw new Error('NotAllowedError')
    })
    const { result } = renderHook(() => useCamara())

    await act(async () => {
      expect(await result.current.solicitarPermiso()).toBe(false)
    })

    expect(result.current.estado).toBe('sin_permiso')
  })

  test('con permiso captura el primer punto y lo guarda encolado', async () => {
    const { stream } = crearStream()
    stubCamara(async () => stream)
    const { result } = renderHook(() => useCamara())

    await act(async () => {
      expect(await result.current.solicitarPermiso()).toBe(true)
    })
    expect(result.current.estado).toBe('activa')
    engancharVideo(result.current.videoRef)

    await act(async () => {
      expect(await result.current.capturarSi(punto(0, 0), RECORRIDO)).toBe(true)
    })

    const cuadros = await db.listarCuadros(RECORRIDO)
    expect(cuadros).toHaveLength(1)
    expect(cuadros[0]).toMatchObject({
      recorridoId: RECORRIDO,
      t: T0,
      rumbo: 90,
      velocidadKmh: 40,
      estadoSubida: 'pendiente',
    })
    expect(cuadros[0].blob).toBeDefined()
    expect(await db.obtenerItemColaCuadros(RECORRIDO)).toMatchObject({ intentos: 0 })
    expect(result.current.cuadros).toBe(1)
  })

  test('no vuelve a capturar hasta que se cumple el umbral de distancia', async () => {
    const { stream } = crearStream()
    stubCamara(async () => stream)
    const { result } = renderHook(() => useCamara())

    await act(async () => {
      await result.current.solicitarPermiso()
    })
    engancharVideo(result.current.videoRef)

    await act(async () => {
      await result.current.capturarSi(punto(0, 0), RECORRIDO)
      expect(await result.current.capturarSi(punto(10, 1000), RECORRIDO)).toBe(false)
      expect(await result.current.capturarSi(punto(DISTANCIA_CUADRO_M + 10, 2000), RECORRIDO)).toBe(
        true,
      )
    })

    expect(await db.contarCuadros(RECORRIDO)).toBe(2)
    expect(result.current.cuadros).toBe(2)
  })

  test('sin espacio en el dispositivo pausa la captura', async () => {
    const { stream } = crearStream()
    stubCamara(async () => stream)
    vi.stubGlobal('navigator', {
      ...navigator,
      mediaDevices: { getUserMedia: vi.fn(async () => stream) },
      storage: { estimate: async () => ({ quota: 1_000_000_000, usage: 999_000_000 }) },
    })
    const { result } = renderHook(() => useCamara())

    await act(async () => {
      await result.current.solicitarPermiso()
    })
    engancharVideo(result.current.videoRef)

    await act(async () => {
      expect(await result.current.capturarSi(punto(0, 0), RECORRIDO)).toBe(false)
    })

    expect(result.current.estado).toBe('sin_espacio')
    expect(await db.listarCuadros(RECORRIDO)).toEqual([])
  })

  test('alternar apaga la cámara, libera el hardware y deja de capturar', async () => {
    const { stream, detener } = crearStream()
    stubCamara(async () => stream)
    const { result } = renderHook(() => useCamara())

    await act(async () => {
      await result.current.solicitarPermiso()
    })
    engancharVideo(result.current.videoRef)

    act(() => result.current.alternar())

    expect(detener).toHaveBeenCalledTimes(1)
    expect(result.current.estado).toBe('inactiva')

    await act(async () => {
      expect(await result.current.capturarSi(punto(0, 0), RECORRIDO)).toBe(false)
    })
    // Apagada a mano, pedir el permiso de nuevo (al retomar) no la reenciende.
    await act(async () => {
      expect(await result.current.solicitarPermiso()).toBe(false)
    })
    expect(result.current.estado).toBe('inactiva')
  })

  test('libera la cámara al desmontar', async () => {
    const { stream, detener } = crearStream()
    stubCamara(async () => stream)
    const { result, unmount } = renderHook(() => useCamara())

    await act(async () => {
      await result.current.solicitarPermiso()
    })

    unmount()

    expect(detener).toHaveBeenCalledTimes(1)
  })
})
