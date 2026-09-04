import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useSensores } from '@/hooks/useSensores'
import * as db from '@/lib/local/db'
import type { Impacto } from '@/lib/sensores/tipos'
import type { PuntoGps } from '@/lib/track'

const RECORRIDO = '11111111-1111-4111-8111-111111111111'
const T0 = 1_700_000_000_000
const GRAVEDAD = 9.8

let ahora = T0

/** Posición con velocidad informada por el navegador (≈40 km/h). */
function posicion(): { punto: PuntoGps; gps: GeolocationPosition } {
  return {
    punto: { lat: -36.85, lng: -57.88, t: ahora, precision: 8 },
    gps: { coords: { speed: 11, heading: 90, altitude: 15 } } as GeolocationPosition,
  }
}

/**
 * Emite un `devicemotion` con las propiedades parcheadas: jsdom no trae
 * `DeviceMotionEvent`, así que se despacha un `Event` con los mismos campos.
 */
function emitirMovimiento(az: number, lineal = true): void {
  const evento = new Event('devicemotion')
  Object.defineProperty(evento, 'accelerationIncludingGravity', {
    value: { x: 0, y: 0, z: GRAVEDAD + az },
  })
  Object.defineProperty(evento, 'acceleration', {
    value: lineal ? { x: 0, y: 0, z: az } : null,
  })
  act(() => {
    window.dispatchEvent(evento)
  })
}

function stubSensores(requestPermission?: () => Promise<string>): void {
  const constructor = function DeviceMotionEventFalso() {} as unknown as Record<string, unknown>
  if (requestPermission) constructor.requestPermission = requestPermission
  vi.stubGlobal('DeviceMotionEvent', constructor)
}

function opciones(extra: Partial<Parameters<typeof useSensores>[0]> = {}) {
  return { recorridoId: RECORRIDO, activo: true, ...extra }
}

beforeEach(async () => {
  ahora = T0
  vi.spyOn(Date, 'now').mockImplementation(() => ahora)
  vi.spyOn(console, 'error').mockImplementation(() => {})

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

describe('useSensores', () => {
  test('sin DeviceMotionEvent queda no disponible', () => {
    vi.stubGlobal('DeviceMotionEvent', undefined)

    const { result } = renderHook(() => useSensores(opciones()))

    expect(result.current.estado).toBe('no_disponible')
  })

  test('sin recorrido o sin grabar queda inactivo', () => {
    stubSensores()

    const { result } = renderHook(() => useSensores(opciones({ activo: false })))

    expect(result.current.estado).toBe('inactivo')
  })

  test('calibra 3 s antes de pasar a activo', () => {
    stubSensores()
    const { result } = renderHook(() => useSensores(opciones()))

    expect(result.current.estado).toBe('calibrando')

    emitirMovimiento(0)
    expect(result.current.estado).toBe('calibrando')

    ahora = T0 + 2999
    emitirMovimiento(0)
    expect(result.current.estado).toBe('calibrando')

    ahora = T0 + 3000
    emitirMovimiento(0)
    expect(result.current.estado).toBe('activo')
  })

  test('guarda el segmento al cerrarse y lo cuenta', async () => {
    stubSensores()
    const { result } = renderHook(() => useSensores(opciones()))

    emitirMovimiento(0) // arranca la calibración
    const { punto, gps } = posicion()
    act(() => result.current.registrarGps(punto, gps))

    ahora = T0 + 5000
    emitirMovimiento(2)

    await waitFor(() => expect(result.current.segmentos).toBe(1))
    const muestras = await db.listarMuestras(RECORRIDO)
    expect(muestras).toHaveLength(1)
    expect(muestras[0].recorridoId).toBe(RECORRIDO)
    expect(muestras[0].rmsVertical).toBeCloseTo(2, 1)
    expect(muestras[0].velocidadKmh).toBeCloseTo(39.6, 1)
    expect(muestras[0].calidad).toBe('malo')
    expect(muestras[0].muestras).toBe(1)
  })

  test('guarda el impacto en el momento y avisa a quien lo escucha', async () => {
    stubSensores()
    const impactos: Impacto[] = []
    const { result } = renderHook(() =>
      useSensores(opciones({ onImpacto: (impacto: Impacto) => impactos.push(impacto) })),
    )

    emitirMovimiento(0)
    const { punto, gps } = posicion()
    act(() => result.current.registrarGps(punto, gps))

    ahora = T0 + 3000
    emitirMovimiento(9)

    await waitFor(() => expect(result.current.impactos).toBe(1))
    expect(impactos).toHaveLength(1)
    expect(impactos[0].pico).toBeCloseTo(9, 1)
    expect(impactos[0].lat).toBe(punto.lat)

    const guardados = await db.listarImpactos(RECORRIDO)
    expect(guardados).toHaveLength(1)
    expect(guardados[0].recorridoId).toBe(RECORRIDO)
  })

  test('sin aceleración lineal le resta la gravedad estimada', async () => {
    stubSensores()
    const { result } = renderHook(() => useSensores(opciones()))

    emitirMovimiento(0, false)
    const { punto, gps } = posicion()
    act(() => result.current.registrarGps(punto, gps))

    ahora = T0 + 5000
    emitirMovimiento(2, false)

    await waitFor(() => expect(result.current.segmentos).toBe(1))
    const muestras = await db.listarMuestras(RECORRIDO)
    // La gravedad ya se estimó en 9.8: lo que queda del golpe son los 2 m/s².
    expect(muestras[0].rmsVertical).toBeCloseTo(2, 1)
  })

  test('un movimiento sin posición no genera segmento', async () => {
    stubSensores()
    const { result } = renderHook(() => useSensores(opciones()))

    emitirMovimiento(0)
    ahora = T0 + 5000
    emitirMovimiento(2)

    expect(result.current.segmentos).toBe(0)
    expect(await db.listarMuestras(RECORRIDO)).toEqual([])
  })

  test('sin permiso de movimiento queda en sin_permiso y no escucha', async () => {
    stubSensores(async () => 'denied')
    const { result } = renderHook(() => useSensores(opciones()))

    let concedido: boolean | null = null
    await act(async () => {
      concedido = await result.current.solicitarPermiso()
    })

    expect(concedido).toBe(false)
    expect(result.current.estado).toBe('sin_permiso')

    emitirMovimiento(9)
    expect(result.current.impactos).toBe(0)
  })

  test('con permiso concedido sigue capturando', async () => {
    stubSensores(async () => 'granted')
    const { result } = renderHook(() => useSensores(opciones()))

    let concedido: boolean | null = null
    await act(async () => {
      concedido = await result.current.solicitarPermiso()
    })

    expect(concedido).toBe(true)
    expect(result.current.estado).toBe('calibrando')
  })

  test('sin requestPermission el permiso es implícito', async () => {
    stubSensores()
    const { result } = renderHook(() => useSensores(opciones()))

    await act(async () => {
      expect(await result.current.solicitarPermiso()).toBe(true)
    })
  })

  test('un rechazo de requestPermission no rompe el recorrido', async () => {
    stubSensores(async () => {
      throw new Error('sin gesto de usuario')
    })
    const { result } = renderHook(() => useSensores(opciones()))

    await act(async () => {
      expect(await result.current.solicitarPermiso()).toBe(false)
    })
    expect(result.current.estado).toBe('sin_permiso')
  })

  test('deja de escuchar al desmontar', () => {
    stubSensores()
    const quitar = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useSensores(opciones()))

    unmount()

    expect(quitar).toHaveBeenCalledWith('devicemotion', expect.any(Function))
  })
})
