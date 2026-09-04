import { describe, expect, test } from 'vitest'
import { calcularCobertura, crearIndice, muestrearLinea, type TramoGeometria } from '@/lib/cobertura'
import type { Coordenada } from '@/lib/geo'

const KM_POR_GRADO = (Math.PI / 180) * 6371
const LAT_BASE = -36.88

function offsetLatKm(km: number): number {
  return km / KM_POR_GRADO
}

function offsetLngKm(km: number, latGrados: number): number {
  return km / (KM_POR_GRADO * Math.cos((latGrados * Math.PI) / 180))
}

/** Línea de 1 km a lo largo de un meridiano, desde LAT_BASE hacia el norte. */
const LNG_TRAMO = -60
const LINEA_1KM: [number, number][] = [
  [LNG_TRAMO, LAT_BASE],
  [LNG_TRAMO, LAT_BASE + offsetLatKm(1)],
]

function trackParaleloA(offsetM: number, pasoM = 10): Coordenada[] {
  const totalM = 1000
  const puntos: Coordenada[] = []
  const lngDesplazado = LNG_TRAMO + offsetLngKm(offsetM / 1000, LAT_BASE)
  for (let d = 0; d <= totalM; d += pasoM) {
    puntos.push({ lat: LAT_BASE + offsetLatKm(d / 1000), lng: lngDesplazado })
  }
  return puntos
}

describe('muestrearLinea', () => {
  test('línea de 1 km cada 50 m da 21 puntos', () => {
    expect(muestrearLinea(LINEA_1KM, 50)).toHaveLength(21)
  })

  test('incluye siempre el primer y el último punto', () => {
    const muestras = muestrearLinea(LINEA_1KM, 30)
    expect(muestras[0]).toEqual({ lat: LAT_BASE, lng: LNG_TRAMO })
    expect(muestras[muestras.length - 1].lat).toBeCloseTo(LAT_BASE + offsetLatKm(1), 6)
  })

  test('línea degenerada (2 puntos idénticos) da 1 punto', () => {
    const linea: [number, number][] = [
      [LNG_TRAMO, LAT_BASE],
      [LNG_TRAMO, LAT_BASE],
    ]
    expect(muestrearLinea(linea, 50)).toHaveLength(1)
  })

  test('línea vacía da un array vacío', () => {
    expect(muestrearLinea([], 50)).toEqual([])
  })
})

describe('crearIndice', () => {
  test('hayCercano encuentra un punto dentro del radio', () => {
    const indice = crearIndice([{ lat: LAT_BASE, lng: LNG_TRAMO }])
    const cerca = { lat: LAT_BASE + offsetLatKm(0.02), lng: LNG_TRAMO } // 20 m
    expect(indice.hayCercano(cerca, 40)).toBe(true)
  })

  test('hayCercano no encuentra nada fuera del radio', () => {
    const indice = crearIndice([{ lat: LAT_BASE, lng: LNG_TRAMO }])
    const lejos = { lat: LAT_BASE + offsetLatKm(0.1), lng: LNG_TRAMO } // 100 m
    expect(indice.hayCercano(lejos, 40)).toBe(false)
  })

  test('encuentra puntos en celdas vecinas', () => {
    // celda de 0.001 grados ~ 111 m; forzamos un punto justo al otro lado del borde
    const indice = crearIndice([{ lat: LAT_BASE, lng: LNG_TRAMO }], 0.001)
    const vecino = { lat: LAT_BASE + 0.0009, lng: LNG_TRAMO } // ~100 m, cruza celda
    expect(indice.hayCercano(vecino, 150)).toBe(true)
  })
})

describe('calcularCobertura', () => {
  const tramo1: TramoGeometria = { id: 't1', km: 1, geometria: LINEA_1KM }

  test('track paralelo a 20 m cubre el tramo con fracción alta', () => {
    const track = trackParaleloA(20)
    const { cubiertos, fraccionPorTramo } = calcularCobertura(track, [tramo1])
    expect(cubiertos).toContain('t1')
    expect(fraccionPorTramo.t1).toBeGreaterThanOrEqual(0.95)
  })

  test('track paralelo a 100 m no cubre el tramo', () => {
    const track = trackParaleloA(100)
    const { cubiertos, fraccionPorTramo } = calcularCobertura(track, [tramo1])
    expect(cubiertos).not.toContain('t1')
    expect(fraccionPorTramo.t1).toBe(0)
  })

  test('track que cubre solo la primera mitad da fracción ~0.5 y no cubre', () => {
    const mitad = trackParaleloA(20).filter((p) => p.lat <= LAT_BASE + offsetLatKm(0.5) + 1e-9)
    const { cubiertos, fraccionPorTramo } = calcularCobertura(mitad, [tramo1])
    expect(cubiertos).not.toContain('t1')
    expect(fraccionPorTramo.t1).toBeGreaterThan(0.4)
    expect(fraccionPorTramo.t1).toBeLessThan(0.6)
  })

  test('con dos tramos, el track solo cubre uno', () => {
    const lngLejano = LNG_TRAMO + 1 // ~89 km más al este, muy lejos
    const tramo2: TramoGeometria = {
      id: 't2',
      km: 1,
      geometria: [
        [lngLejano, LAT_BASE],
        [lngLejano, LAT_BASE + offsetLatKm(1)],
      ],
    }
    const track = trackParaleloA(20)
    const { cubiertos } = calcularCobertura(track, [tramo1, tramo2])
    expect(cubiertos).toEqual(['t1'])
  })

  test('track vacío no cubre nada', () => {
    const { cubiertos, fraccionPorTramo } = calcularCobertura([], [tramo1])
    expect(cubiertos).toEqual([])
    expect(fraccionPorTramo.t1).toBe(0)
  })

  test('rendimiento: 165 tramos de ~12k muestras totales vs 2000 puntos de track < 2 s', () => {
    // Genera tramos aleatorios pero deterministas alrededor de LAT_BASE.
    let semilla = 42
    const aleatorio = (): number => {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff
      return semilla / 0x7fffffff
    }

    const tramos: TramoGeometria[] = []
    for (let i = 0; i < 165; i += 1) {
      const latIni = LAT_BASE + (aleatorio() - 0.5) * 0.5
      const lngIni = LNG_TRAMO + (aleatorio() - 0.5) * 0.5
      const largoKm = 2 + aleatorio() * 3.4 // ~2-5.4 km, promedio ~3.7 km
      const rumbo = aleatorio() * 2 * Math.PI
      const latFin = latIni + offsetLatKm(largoKm) * Math.cos(rumbo)
      const lngFin = lngIni + offsetLngKm(largoKm, latIni) * Math.sin(rumbo)
      tramos.push({
        id: `tramo-${i}`,
        km: largoKm,
        geometria: [
          [lngIni, latIni],
          [lngFin, latFin],
        ],
      })
    }

    const track: Coordenada[] = []
    for (let i = 0; i < 2000; i += 1) {
      track.push({
        lat: LAT_BASE + (aleatorio() - 0.5) * 0.5,
        lng: LNG_TRAMO + (aleatorio() - 0.5) * 0.5,
      })
    }

    const inicio = Date.now()
    const { fraccionPorTramo } = calcularCobertura(track, tramos)
    const duracionMs = Date.now() - inicio

    expect(Object.keys(fraccionPorTramo)).toHaveLength(165)
    expect(duracionMs).toBeLessThan(2000)
  })
})

describe('umbral de cobertura (frontera inclusiva)', () => {
  // Línea de 500 m: muestreada cada 50 m da 11 muestras (500 / 50 = 10 pasos + 1).
  const RADIO_M = 40
  const PASO_M = 50
  const LINEA_500M: [number, number][] = [
    [LNG_TRAMO, LAT_BASE],
    [LNG_TRAMO, LAT_BASE + offsetLatKm(0.5)],
  ]
  const tramo500: TramoGeometria = { id: 't500', km: 0.5, geometria: LINEA_500M }

  /** Track formado por las primeras `cantidad` muestras exactas del tramo (distancia 0). */
  function trackConMuestras(cantidad: number): Coordenada[] {
    const muestras = muestrearLinea(LINEA_500M, PASO_M)
    expect(muestras).toHaveLength(11)
    return muestras.slice(0, cantidad)
  }

  test('7/11 (~0.636) cubre con el umbral por defecto (0.6)', () => {
    const track = trackConMuestras(7)
    const { cubiertos, fraccionPorTramo } = calcularCobertura(track, [tramo500], {
      radioM: RADIO_M,
      umbral: 0.6,
      pasoM: PASO_M,
    })
    expect(fraccionPorTramo.t500).toBeCloseTo(7 / 11)
    expect(cubiertos).toContain('t500')
  })

  test('6/11 (~0.545) no cubre con el umbral por defecto (0.6)', () => {
    const track = trackConMuestras(6)
    const { cubiertos, fraccionPorTramo } = calcularCobertura(track, [tramo500], {
      radioM: RADIO_M,
      umbral: 0.6,
      pasoM: PASO_M,
    })
    expect(fraccionPorTramo.t500).toBeCloseTo(6 / 11)
    expect(cubiertos).not.toContain('t500')
  })

  test('cuando la fracción es exactamente igual al umbral, el tramo queda cubierto (>=, no >)', () => {
    const umbral = 7 / 11
    const track = trackConMuestras(7)
    const { cubiertos, fraccionPorTramo } = calcularCobertura(track, [tramo500], {
      radioM: RADIO_M,
      umbral,
      pasoM: PASO_M,
    })
    expect(fraccionPorTramo.t500).toBe(umbral)
    expect(cubiertos).toContain('t500')
  })
})
