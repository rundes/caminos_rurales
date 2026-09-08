import { describe, expect, test } from 'vitest'
import { buscarTramos, combinarTramos, kmDeGeometria, ordenarTramos, type TramoListado } from '@/lib/tramos'
import type { TramoResumen } from '@/lib/tramos-consultas'
import { kmDeTrack } from '@/lib/track'

const RESUMEN: TramoResumen[] = [
  { id: 't1', nombre_codigo: 'CR-014 Camino a La Elisa', localidad: 'Maipú', km: 5, veces: 2, ultimaVisita: '2026-01-05T00:00:00Z', cuadros: 3 },
  { id: 't2', nombre_codigo: 'CR-002 Camino del Medio', localidad: 'Franklin', km: 12, veces: 0, ultimaVisita: null, cuadros: 0 },
  { id: 't3', nombre_codigo: 'CR-030 Ruta vecinal', localidad: 'Maipú', km: 8, veces: 1, ultimaVisita: '2026-01-10T00:00:00Z', cuadros: 1 },
]

describe('combinarTramos', () => {
  test('cruza cada tramo con la calidad de rugosidad_tramos por id', () => {
    const resultado = combinarTramos(RESUMEN, { t1: { calidad: 'malo', rms: 2, velocidad: 30, impactos: 1, segmentos: 4 } })
    expect(resultado.find((t) => t.id === 't1')?.calidad).toBe('malo')
  })

  test('sin rugosidad para un tramo, la calidad es "sin_dato"', () => {
    const resultado = combinarTramos(RESUMEN, {})
    expect(resultado.every((t) => t.calidad === 'sin_dato')).toBe(true)
  })

  test('conserva todos los campos originales del resumen', () => {
    const [t1] = combinarTramos(RESUMEN, {})
    expect(t1).toMatchObject(RESUMEN[0])
  })
})

const LISTADO: TramoListado[] = combinarTramos(RESUMEN, {})

describe('buscarTramos', () => {
  test('sin búsqueda devuelve todos', () => {
    expect(buscarTramos(LISTADO, undefined)).toHaveLength(3)
    expect(buscarTramos(LISTADO, '')).toHaveLength(3)
    expect(buscarTramos(LISTADO, '   ')).toHaveLength(3)
  })

  test('filtra por nombre/código sin distinguir mayúsculas', () => {
    expect(buscarTramos(LISTADO, 'elisa')).toHaveLength(1)
    expect(buscarTramos(LISTADO, 'CR-002')).toEqual([LISTADO[1]])
  })

  test('sin coincidencias devuelve []', () => {
    expect(buscarTramos(LISTADO, 'no existe')).toEqual([])
  })
})

describe('ordenarTramos', () => {
  test('orden "km" ordena descendente', () => {
    const ordenado = ordenarTramos(LISTADO, 'km')
    expect(ordenado.map((t) => t.id)).toEqual(['t2', 't3', 't1'])
  })

  test('orden "visita" ordena por última visita más reciente primero, sin visita al final', () => {
    const ordenado = ordenarTramos(LISTADO, 'visita')
    expect(ordenado.map((t) => t.id)).toEqual(['t3', 't1', 't2'])
  })

  test('sin orden reconocido, ordena alfabéticamente por nombre_codigo', () => {
    const ordenado = ordenarTramos(LISTADO, undefined)
    expect(ordenado.map((t) => t.id)).toEqual(['t2', 't1', 't3'])
  })

  test('no muta el arreglo original', () => {
    const copia = [...LISTADO]
    ordenarTramos(LISTADO, 'km')
    expect(LISTADO).toEqual(copia)
  })
})

describe('kmDeGeometria', () => {
  test('coincide con kmDeTrack sobre los mismos puntos convertidos [lng,lat] -> {lat,lng}', () => {
    const geometria: [number, number][] = [
      [-57.9, -36.99],
      [-57.89, -36.98],
      [-57.85, -36.95],
    ]
    const esperado = Number(
      kmDeTrack(geometria.map(([lng, lat]) => ({ lat, lng }))).toFixed(3),
    )
    expect(kmDeGeometria(geometria)).toBe(esperado)
  })

  test('un único punto no recorre distancia', () => {
    expect(kmDeGeometria([[-57.9, -36.99]])).toBe(0)
  })

  test('geometría vacía da 0 km', () => {
    expect(kmDeGeometria([])).toBe(0)
  })

  test('redondea a 3 decimales', () => {
    const geometria: [number, number][] = [
      [-57.9, -36.99],
      [-57.89123456, -36.98123456],
    ]
    const km = kmDeGeometria(geometria)
    expect(km).toBe(Number(km.toFixed(3)))
  })
})
