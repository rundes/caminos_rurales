import { describe, expect, test } from 'vitest'
import { agruparPorTramo, calcularVecinos, SIN_TRAMO, vecinos, type Cuadro } from '@/lib/cuadros'

function cuadro(overrides: Partial<Cuadro>): Cuadro {
  return {
    id: 'c1',
    recorrido_id: 'r1',
    tramo_id: 't1',
    t: '2026-09-01T00:00:00Z',
    lat: -36.6,
    lng: -60.1,
    rumbo: null,
    velocidadKmh: null,
    ruta: 'ruta.jpg',
    ...overrides,
  }
}

describe('agruparPorTramo', () => {
  test('agrupa por tramo y ordena cada grupo por t ascendente', () => {
    const c1 = cuadro({ id: 'c1', tramo_id: 't1', t: '2026-09-01T00:00:02Z' })
    const c2 = cuadro({ id: 'c2', tramo_id: 't1', t: '2026-09-01T00:00:01Z' })
    const c3 = cuadro({ id: 'c3', tramo_id: 't2', t: '2026-09-01T00:00:00Z' })

    const grupos = agruparPorTramo([c1, c2, c3])

    expect(grupos.get('t1')?.map((c) => c.id)).toEqual(['c2', 'c1'])
    expect(grupos.get('t2')?.map((c) => c.id)).toEqual(['c3'])
  })

  test('cuadros sin tramo van a la clave SIN_TRAMO', () => {
    const c1 = cuadro({ id: 'c1', tramo_id: null })

    const grupos = agruparPorTramo([c1])

    expect(grupos.get(SIN_TRAMO)?.map((c) => c.id)).toEqual(['c1'])
  })

  test('lista vacía devuelve mapa vacío', () => {
    expect(agruparPorTramo([]).size).toBe(0)
  })
})

describe('vecinos', () => {
  const c1 = cuadro({ id: 'c1', tramo_id: 't1', t: '2026-09-01T00:00:00Z' })
  const c2 = cuadro({ id: 'c2', tramo_id: 't1', t: '2026-09-01T00:00:01Z' })
  const c3 = cuadro({ id: 'c3', tramo_id: 't1', t: '2026-09-01T00:00:02Z' })
  const otroTramo = cuadro({ id: 'o1', tramo_id: 't2', t: '2026-09-01T00:00:00Z' })
  const todos = [c1, c2, c3, otroTramo]

  test('devuelve anterior y siguiente dentro del mismo tramo', () => {
    expect(vecinos(todos, 'c2')).toEqual({ anterior: c1, siguiente: c3 })
  })

  test('el primero del tramo no tiene anterior', () => {
    expect(vecinos(todos, 'c1')).toEqual({ anterior: null, siguiente: c2 })
  })

  test('el último del tramo no tiene siguiente', () => {
    expect(vecinos(todos, 'c3')).toEqual({ anterior: c2, siguiente: null })
  })

  test('no cruza a cuadros de otro tramo', () => {
    expect(vecinos(todos, 'o1')).toEqual({ anterior: null, siguiente: null })
  })

  test('id inexistente devuelve ambos null', () => {
    expect(vecinos(todos, 'inexistente')).toEqual({ anterior: null, siguiente: null })
  })
})

describe('calcularVecinos', () => {
  const c1 = cuadro({ id: 'c1', tramo_id: 't1', t: '2026-09-01T00:00:00Z' })
  const c2 = cuadro({ id: 'c2', tramo_id: 't1', t: '2026-09-01T00:00:01Z' })
  const c3 = cuadro({ id: 'c3', tramo_id: 't1', t: '2026-09-01T00:00:02Z' })
  const otroTramo = cuadro({ id: 'o1', tramo_id: 't2', t: '2026-09-01T00:00:00Z' })
  const todos = [c1, c2, c3, otroTramo]

  test('devuelve un mapa con anterior/siguiente por id, coherente con vecinos()', () => {
    const mapa = calcularVecinos(todos)

    expect(mapa.get('c1')).toEqual({ anterior: null, siguiente: c2 })
    expect(mapa.get('c2')).toEqual({ anterior: c1, siguiente: c3 })
    expect(mapa.get('c3')).toEqual({ anterior: c2, siguiente: null })
    expect(mapa.get('o1')).toEqual({ anterior: null, siguiente: null })
    for (const c of todos) {
      expect(mapa.get(c.id)).toEqual(vecinos(todos, c.id))
    }
  })

  test('id ausente del mapa (no incluido en la lista de entrada)', () => {
    expect(calcularVecinos(todos).get('inexistente')).toBeUndefined()
  })

  test('lista vacía devuelve mapa vacío', () => {
    expect(calcularVecinos([]).size).toBe(0)
  })
})
