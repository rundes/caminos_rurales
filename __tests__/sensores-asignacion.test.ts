import { describe, expect, test } from 'vitest'
import type { TramoGeometria } from '@/lib/cobertura'
import { crearAsignadorTramos } from '@/lib/sensores/asignacion'

/** Un grado de latitud son ~111,32 km: 0.0001° ≈ 11,1 m sobre el ecuador. */
const TRAMOS: TramoGeometria[] = [
  // Recto sobre el ecuador, de lng 0 a lng 0.01 (~1,1 km).
  { id: 'w1', km: 1.1, geometria: [[0, 0], [0.01, 0]] },
  // Paralelo, 111 m al norte.
  { id: 'w2', km: 1.1, geometria: [[0, 0.001], [0.01, 0.001]] },
]

describe('crearAsignadorTramos', () => {
  test('asigna el tramo cuando el punto cae encima', () => {
    const asignador = crearAsignadorTramos(TRAMOS)
    expect(asignador.tramoDe({ lat: 0, lng: 0.004 })).toBe('w1')
    expect(asignador.tramoDe({ lat: 0.001, lng: 0.004 })).toBe('w2')
  })

  test('asigna dentro del radio de 40 m', () => {
    const asignador = crearAsignadorTramos(TRAMOS)
    // ~33 m al norte del tramo w1
    expect(asignador.tramoDe({ lat: 0.0003, lng: 0.004 })).toBe('w1')
  })

  test('no asigna nada fuera del radio de 40 m', () => {
    const asignador = crearAsignadorTramos(TRAMOS)
    // ~56 m de cada tramo: queda en tierra de nadie
    expect(asignador.tramoDe({ lat: 0.0005, lng: 0.004 })).toBeNull()
    // muy lejos de todo
    expect(asignador.tramoDe({ lat: -37.1, lng: -57.9 })).toBeNull()
  })

  test('entre dos tramos dentro del radio elige el más cercano', () => {
    const asignador = crearAsignadorTramos(TRAMOS, 100)
    // ~44 m de w1 y ~67 m de w2
    expect(asignador.tramoDe({ lat: 0.0004, lng: 0.004 })).toBe('w1')
    // ~67 m de w1 y ~44 m de w2
    expect(asignador.tramoDe({ lat: 0.0006, lng: 0.004 })).toBe('w2')
  })

  test('también asigna más allá del final de un vértice si el muestreo lo cubre', () => {
    const asignador = crearAsignadorTramos(TRAMOS)
    // extremo exacto del tramo
    expect(asignador.tramoDe({ lat: 0, lng: 0.01 })).toBe('w1')
  })

  test('sin tramos o con coordenadas inválidas devuelve null', () => {
    expect(crearAsignadorTramos([]).tramoDe({ lat: 0, lng: 0 })).toBeNull()
    expect(crearAsignadorTramos(TRAMOS).tramoDe({ lat: Number.NaN, lng: 0 })).toBeNull()
  })
})
