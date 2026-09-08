import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  ERROR_SIN_ESPACIO,
  MAX_FALLOS_GUARDADO,
  useGrabadorGps,
} from '@/hooks/useGrabadorGps'
import * as db from '@/lib/local/db'
import { UMBRAL_INTERRUPCION_MS } from '@/lib/local/grabador'

const USUARIO = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
const T0 = 1_700_000_000_000

type AlPunto = (posicion: GeolocationPosition) => void
type AlFallo = (error: GeolocationPositionError) => void

let alPunto: AlPunto | null = null
let alFallo: AlFallo | null = null
const clearWatch = vi.fn()
const watchPosition = vi.fn((exito: AlPunto, fallo: AlFallo) => {
  alPunto = exito
  alFallo = fallo
  return 7
})

/** ~111 m por cada 0.001° de latitud: pasa el filtro de 5 m. */
function posicion(indice: number, precision = 8): GeolocationPosition {
  return {
    coords: {
      latitude: -36.85 + indice * 0.001,
      longitude: -57.88,
      accuracy: precision,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: T0 + indice * 1000,
    toJSON: () => ({}),
  } as unknown as GeolocationPosition
}

function opciones() {
  return { usuarioId: USUARIO, municipio: 'maipu' }
}

beforeEach(async () => {
  alPunto = null
  alFallo = null
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('crypto', { ...globalThis.crypto, randomUUID: () => '11111111-1111-4111-8111-111111111111' })
  Object.defineProperty(navigator, 'geolocation', {
    value: { watchPosition, clearWatch },
    configurable: true,
  })

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

describe('useGrabadorGps', () => {
  test('iniciar guarda el recorrido con el usuario en sesión y abre el watch', async () => {
    const { result } = renderHook(() => useGrabadorGps(opciones()))

    await act(async () => await result.current.iniciar())

    expect(result.current.estado.estado).toBe('grabando')
    const id = result.current.estado.recorridoId as string
    expect((await db.obtenerRecorrido(id))?.usuarioId).toBe(USUARIO)
    await waitFor(() => expect(watchPosition).toHaveBeenCalledTimes(1))
  })

  test('persiste los puntos aceptados y descarta los de baja precisión', async () => {
    const { result } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    const id = result.current.estado.recorridoId as string
    await waitFor(() => expect(alPunto).not.toBeNull())

    await act(async () => {
      alPunto?.(posicion(0))
      alPunto?.(posicion(1))
      alPunto?.(posicion(2, 90)) // precisión de 90 m: se filtra
    })

    await waitFor(async () => expect(await db.listarPuntos(id)).toHaveLength(2))
    expect(result.current.estado.cantidad).toBe(2)
    expect(result.current.obtenerPuntos()).toHaveLength(2)
    expect(result.current.estado.km).toBeGreaterThan(0)
    // La precisión sí se refresca con el punto descartado.
    expect(result.current.precision).not.toBeNull()
  })

  test('en pausa ignora los puntos que siguen llegando', async () => {
    const { result } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    const id = result.current.estado.recorridoId as string
    await waitFor(() => expect(alPunto).not.toBeNull())

    await act(async () => alPunto?.(posicion(0)))
    await waitFor(async () => expect(await db.listarPuntos(id)).toHaveLength(1))

    const emisor = alPunto
    act(() => result.current.pausar())
    await act(async () => emisor?.(posicion(5)))

    expect(result.current.estado.estado).toBe('pausado')
    expect(result.current.estado.cantidad).toBe(1)
    expect(await db.listarPuntos(id)).toHaveLength(1)
  })

  test('finalizar cierra el watch y devuelve el resultado del cierre', async () => {
    const { result } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    await waitFor(() => expect(alPunto).not.toBeNull())
    await act(async () => {
      alPunto?.(posicion(0))
      alPunto?.(posicion(1))
    })

    let cierre: Awaited<ReturnType<typeof result.current.finalizar>> = null
    await act(async () => {
      cierre = await result.current.finalizar()
    })

    expect(cierre).toMatchObject({ ok: true })
    expect(result.current.estado.estado).toBe('finalizado')
    await waitFor(() => expect(clearWatch).toHaveBeenCalledWith(7))
  })

  test('un recorrido de un solo punto se descarta al finalizar', async () => {
    const { result } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    await waitFor(() => expect(alPunto).not.toBeNull())
    await act(async () => alPunto?.(posicion(0)))

    let cierre: Awaited<ReturnType<typeof result.current.finalizar>> = null
    await act(async () => {
      cierre = await result.current.finalizar()
    })

    expect(cierre).toMatchObject({ ok: false, motivo: 'descartado' })
  })

  test('cierra el watch al desmontar', async () => {
    const { result, unmount } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    await waitFor(() => expect(watchPosition).toHaveBeenCalled())

    unmount()

    expect(clearWatch).toHaveBeenCalledWith(7)
  })

  test('avisa recién después de varios fallos de escritura seguidos y sigue grabando', async () => {
    const guardar = vi.spyOn(db, 'guardarPunto').mockRejectedValue(new Error('QuotaExceededError'))
    const { result } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    await waitFor(() => expect(alPunto).not.toBeNull())

    await act(async () => alPunto?.(posicion(0)))
    expect(result.current.error).toBeNull()

    await act(async () => {
      for (let i = 1; i < MAX_FALLOS_GUARDADO; i += 1) alPunto?.(posicion(i))
    })

    await waitFor(() => expect(result.current.error).toBe(ERROR_SIN_ESPACIO))
    expect(guardar).toHaveBeenCalledTimes(MAX_FALLOS_GUARDADO)
    // El track sigue completo en memoria aunque el disco falle.
    expect(result.current.obtenerPuntos()).toHaveLength(MAX_FALLOS_GUARDADO)
    expect(result.current.estado.estado).toBe('grabando')
  })

  test('un error del GPS se muestra traducido', async () => {
    const { result } = renderHook(() => useGrabadorGps(opciones()))
    await act(async () => await result.current.iniciar())
    await waitFor(() => expect(alFallo).not.toBeNull())

    act(() => alFallo?.({ code: 1 } as GeolocationPositionError))

    expect(result.current.error).toMatch(/permiso de ubicación/i)
  })

  describe('watchdog de interrupción', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
      vi.setSystemTime(T0)
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    test('sin lecturas nuevas por más del umbral, el watchdog corta como una pausa', async () => {
      const { result } = renderHook(() => useGrabadorGps(opciones()))
      await act(async () => await result.current.iniciar())
      await act(async () => alPunto?.(posicion(0)))
      expect(result.current.estado.estado).toBe('grabando')

      // El intervalo del watchdog corre cada 5 s: avanzar de sobra sin
      // emitir ninguna lectura nueva simula 2° plano o una zona sin señal.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(UMBRAL_INTERRUPCION_MS + 10_000)
      })

      expect(result.current.estado.estado).toBe('pausado')
      // La pausa automática no corta todavía: el corte lo agrega recién
      // `reanudar` (mismo mecanismo que una pausa manual).
      expect(result.current.estado.cortes).toEqual([])
      expect(result.current.interrupcionActual).not.toBeNull()
      expect(result.current.interrupcionActual?.desde).toBe(posicion(0).timestamp)
      expect(result.current.interrupciones).toHaveLength(1)
      // Pausar cierra el watch, igual que una pausa manual (no hay GPS que escuchar).
      expect(clearWatch).toHaveBeenCalledWith(7)
    })

    test('reanudar tras una interrupción agrega el corte y limpia el aviso en vivo', async () => {
      const { result } = renderHook(() => useGrabadorGps(opciones()))
      await act(async () => await result.current.iniciar())
      await act(async () => alPunto?.(posicion(0)))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(UMBRAL_INTERRUPCION_MS + 10_000)
      })
      expect(result.current.estado.estado).toBe('pausado')

      act(() => result.current.reanudar())

      expect(result.current.estado.estado).toBe('grabando')
      expect(result.current.estado.cortes).toEqual([result.current.estado.cantidad])
      expect(result.current.interrupcionActual).toBeNull()
      // El historial para el resumen final se conserva.
      expect(result.current.interrupciones).toHaveLength(1)
    })

    test('al volver a estar visible después de un hueco largo, corta sin esperar el próximo tick', async () => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      const { result } = renderHook(() => useGrabadorGps(opciones()))
      await act(async () => await result.current.iniciar())
      await act(async () => alPunto?.(posicion(0)))

      // El reloj avanza (la app estuvo en 2° plano) sin que ningún timer
      // llegue a correr: nada detecta el hueco hasta que la pestaña vuelve.
      vi.setSystemTime(T0 + UMBRAL_INTERRUPCION_MS + 10_000)
      expect(result.current.estado.estado).toBe('grabando')

      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      expect(result.current.estado.estado).toBe('pausado')
      expect(result.current.interrupcionActual).not.toBeNull()
    })

    test('un hueco corto (por debajo del umbral) no se trata como interrupción', async () => {
      const { result } = renderHook(() => useGrabadorGps(opciones()))
      await act(async () => await result.current.iniciar())
      await act(async () => alPunto?.(posicion(0)))

      await act(async () => {
        await vi.advanceTimersByTimeAsync(UMBRAL_INTERRUPCION_MS - 10_000)
      })

      expect(result.current.estado.estado).toBe('grabando')
      expect(result.current.interrupcionActual).toBeNull()
      expect(result.current.interrupciones).toHaveLength(0)
    })
  })
})
