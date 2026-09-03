import { describe, expect, test } from 'vitest'
import { localidadDeTramo } from '../scripts/lib/asignar-caminos.mjs'
import { enLotes, generarSql, tramosDeColeccion } from '../scripts/seed-tramos.mjs'

const contexto = {
  poligonosUrbanos: [],
  localidadesRurales: [
    { label: 'Segurola', centroide: [-57.45, -36.83] },
    { label: 'Las Armas', centroide: [-57.83, -37.08] },
  ],
}

const coleccion = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, nombre_codigo: 'Caminos vecinales - Las Armas' },
      geometry: { type: 'LineString', coordinates: [[-57.83, -37.08], [-57.84, -37.08]] },
    },
    {
      type: 'Feature',
      properties: { id: 2, nombre_codigo: 'RP 62' },
      geometry: { type: 'LineString', coordinates: [[-57.45, -36.83], [-57.46, -36.83]] },
    },
    {
      type: 'Feature',
      properties: { id: 3, nombre_codigo: null },
      geometry: { type: 'LineString', coordinates: [[-57.45, -36.83], [-57.46, -36.83]] },
    },
  ],
}

describe('localidadDeTramo', () => {
  test('usa el sufijo de "Caminos vecinales - X"', () => {
    expect(localidadDeTramo(coleccion.features[0], contexto)).toBe('Las Armas')
  })

  test('para códigos numéricos y RP usa la localidad rural más cercana al punto medio', () => {
    expect(localidadDeTramo(coleccion.features[1], contexto)).toBe('Segurola')
  })
})

describe('tramosDeColeccion', () => {
  test('excluye los tramos sin nombre_codigo y devuelve id como texto', () => {
    const tramos = tramosDeColeccion(coleccion, contexto)
    expect(tramos).toHaveLength(2)
    expect(tramos[0].id).toBe('1')
    expect(tramos[0].localidad).toBe('Las Armas')
    expect(tramos[0].km).toBeGreaterThan(0)
    expect(tramos[0].geometria).toEqual(coleccion.features[0].geometry.coordinates)
  })
})

describe('generarSql', () => {
  test('genera un upsert por id con la geometría como jsonb', () => {
    const sql = generarSql(tramosDeColeccion(coleccion, contexto))
    expect(sql).toContain('insert into public.tramos')
    expect(sql).toContain('on conflict (id) do update set')
    expect(sql).toContain("'maipu'")
    expect(sql).toContain('::jsonb')
  })

  test('escapa las comillas simples de los textos', () => {
    const sql = generarSql([
      { id: "a'b", nombre_codigo: "R'P", localidad: "L'A", km: 1, geometria: [] },
    ])
    expect(sql).toContain("'a''b'")
    expect(sql).toContain("'R''P'")
    expect(sql).toContain("'L''A'")
  })
})

describe('enLotes', () => {
  test('parte la lista en lotes del tamaño pedido', () => {
    expect(enLotes([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  test('devuelve una lista vacía si no hay elementos', () => {
    expect(enLotes([], 2)).toEqual([])
  })
})
