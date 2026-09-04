import { describe, expect, test } from 'vitest'
import {
  asignarNombreCodigo,
  construirContexto,
  esCalleUrbana,
  esUrbano,
  normalizarNombre,
  procesarColeccion,
  puntoMedio,
} from '../scripts/lib/asignar-caminos.mjs'
import { generarSql } from '../scripts/seed-caminos-maipu.mjs'

describe('normalizarNombre', () => {
  test('Ruta Provincial 62 -> RP 62', () => {
    expect(normalizarNombre('Ruta Provincial 62')).toBe('RP 62')
  })

  test('Camino provincial secundario 066-0X -> 066-0X', () => {
    expect(normalizarNombre('Camino provincial secundario 066-02')).toBe('066-02')
  })

  test('Camino Secundario 066-0X (sin "provincial") -> 066-0X', () => {
    expect(normalizarNombre('Camino Secundario 066-04')).toBe('066-04')
  })

  test('Camino provincial secundario 039-08 -> 039-08', () => {
    expect(normalizarNombre('Camino provincial secundario 039-08')).toBe('039-08')
  })

  test('nombre sin patrón conocido se devuelve tal cual', () => {
    expect(normalizarNombre('Rivadavia')).toBe('Rivadavia')
  })

  test('nombre nulo o vacío devuelve null', () => {
    expect(normalizarNombre(null)).toBeNull()
    expect(normalizarNombre('')).toBeNull()
  })
})

describe('puntoMedio', () => {
  test('punto medio de una línea recta de dos puntos', () => {
    const [lng, lat] = puntoMedio([
      [0, 0],
      [0, 2],
    ])
    expect(lng).toBeCloseTo(0, 5)
    expect(lat).toBeCloseTo(1, 1)
  })

  test('una sola coordenada devuelve esa coordenada', () => {
    expect(puntoMedio([[-58, -35]])).toEqual([-58, -35])
  })
})

const CUADRADO_URBANO = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
  [0, 0],
]

describe('esUrbano', () => {
  const poligonosUrbanos = [{ nombre: 'Barrio Centro', anillo: CUADRADO_URBANO }]

  test('un punto dentro del polígono urbano es urbano', () => {
    expect(esUrbano([0.5, 0.5], poligonosUrbanos)).toBe(true)
  })

  test('un punto fuera de todos los polígonos no es urbano', () => {
    expect(esUrbano([50, 50], poligonosUrbanos)).toBe(false)
  })
})

describe('esCalleUrbana', () => {
  test('calle terciaria con nombre de pueblo es urbana', () => {
    expect(esCalleUrbana({ name: 'Rivadavia', highway: 'tertiary', surface: null })).toBe(true)
  })

  test('calle secundaria con nombre de pueblo es urbana aunque no esté pavimentada', () => {
    expect(esCalleUrbana({ name: 'Avenida Ayacucho', highway: 'tertiary', surface: 'unpaved' })).toBe(true)
  })

  test('un camino con nombre "Camino ..." no es calle urbana', () => {
    expect(esCalleUrbana({ name: 'Camino Secundario 066-01', highway: 'tertiary', surface: 'paved' })).toBe(false)
  })

  test('una ruta con nombre "Ruta ..." no es calle urbana', () => {
    expect(esCalleUrbana({ name: 'Ruta Provincial 62', highway: 'tertiary', surface: 'paved' })).toBe(false)
  })

  test('un tramo sin nombre no es calle urbana', () => {
    expect(esCalleUrbana({ name: null, highway: 'tertiary', surface: 'paved' })).toBe(false)
  })

  test('highway track/unclassified no cuenta como calle urbana', () => {
    expect(esCalleUrbana({ name: 'Rivadavia', highway: 'track', surface: 'paved' })).toBe(false)
  })
})

function lineaFeature(properties: Record<string, unknown>, coordinates: [number, number][]) {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }
}

function poligonoFeature(name: string, anillo: [number, number][]) {
  return { type: 'Feature', properties: { name }, geometry: { type: 'Polygon', coordinates: [anillo] } }
}

// Localidades de prueba: un polígono urbano en (0,0)-(1,1) y dos rurales
// bien separados entre sí para que la localidad más cercana no sea ambigua.
const LOCALIDADES_TEST = {
  type: 'FeatureCollection',
  features: [
    poligonoFeature('Barrio Centro', CUADRADO_URBANO as [number, number][]),
    poligonoFeature('Barrio Segurola', [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ]),
    poligonoFeature('Las Armas', [
      [-10, -10],
      [-9, -10],
      [-9, -9],
      [-10, -9],
      [-10, -10],
    ]),
  ],
}

describe('construirContexto', () => {
  test('separa polígonos urbanos de localidades rurales e incluye la cabecera', () => {
    const contexto = construirContexto(LOCALIDADES_TEST)
    expect(contexto.poligonosUrbanos.map((p: { nombre: string }) => p.nombre)).toEqual(['Barrio Centro'])
    expect(contexto.localidadesRurales.map((l: { label: string }) => l.label)).toEqual(['Segurola', 'Las Armas', 'Maipú'])
  })
})

describe('asignarNombreCodigo / procesarColeccion', () => {
  const contexto = construirContexto(LOCALIDADES_TEST)

  test('normaliza un tramo con nombre de ruta provincial', () => {
    const feature = lineaFeature({ name: 'Ruta Provincial 62', highway: 'tertiary', surface: 'unpaved' }, [
      [50, 50],
      [50.1, 50.1],
    ])
    expect(asignarNombreCodigo(feature, contexto)).toBe('RP 62')
  })

  test('excluye un tramo cuyo punto medio cae en un polígono urbano', () => {
    const feature = lineaFeature({ name: null, highway: 'track', surface: null }, [
      [0.4, 0.4],
      [0.6, 0.6],
    ])
    expect(asignarNombreCodigo(feature, contexto)).toBeNull()
  })

  test('excluye una calle urbana con nombre aunque esté fuera del polígono relevado', () => {
    const feature = lineaFeature({ name: 'Rivadavia', highway: 'secondary', surface: null }, [
      [50, 50],
      [50.1, 50.1],
    ])
    expect(asignarNombreCodigo(feature, contexto)).toBeNull()
  })

  test('agrupa un tramo sin nombre por la localidad rural más cercana', () => {
    const feature = lineaFeature({ name: null, highway: 'track', surface: 'unpaved' }, [
      [10.4, 10.4],
      [10.6, 10.6],
    ])
    expect(asignarNombreCodigo(feature, contexto)).toBe('Caminos vecinales - Segurola')
  })

  test('un tramo sin nombre lejos de toda localidad rural relevada cae en la cabecera', () => {
    const feature = lineaFeature({ name: null, highway: 'track', surface: 'unpaved' }, [
      [-57.586, -36.887],
      [-57.585, -36.886],
    ])
    expect(asignarNombreCodigo(feature, contexto)).toBe('Caminos vecinales - Maipú')
  })

  test('procesarColeccion produce códigos únicos esperados y cuenta tramos/km', () => {
    const coleccion = {
      type: 'FeatureCollection',
      features: [
        lineaFeature({ name: 'Ruta Provincial 62', highway: 'tertiary', surface: 'unpaved' }, [
          [50, 50],
          [50.1, 50.1],
        ]),
        lineaFeature({ name: 'Camino provincial secundario 066-01', highway: 'track', surface: 'unpaved' }, [
          [51, 51],
          [51.1, 51.1],
        ]),
        lineaFeature({ name: 'Camino Secundario 066-01', highway: 'track', surface: 'unpaved' }, [
          [52, 52],
          [52.1, 52.1],
        ]),
        lineaFeature({ name: 'Camino provincial secundario 039-08', highway: 'track', surface: 'unpaved' }, [
          [53, 53],
          [53.1, 53.1],
        ]),
        lineaFeature({ name: 'Rivadavia', highway: 'secondary', surface: null }, [
          [54, 54],
          [54.1, 54.1],
        ]),
        lineaFeature({ name: null, highway: 'track', surface: null }, [
          [0.4, 0.4],
          [0.6, 0.6],
        ]),
        lineaFeature({ name: null, highway: 'track', surface: 'unpaved' }, [
          [10.4, 10.4],
          [10.6, 10.6],
        ]),
      ],
    }

    const { coleccion: resultado, resumen } = procesarColeccion(coleccion, contexto)

    expect([...resumen.keys()].sort()).toEqual(['066-01', '039-08', 'Caminos vecinales - Segurola', 'RP 62'].sort())
    expect(resumen.get('066-01')?.tramos).toBe(2)
    expect(resumen.get('RP 62')?.tramos).toBe(1)
    expect(resumen.get('RP 62')?.km).toBeGreaterThan(0)

    // el tramo dentro del polígono urbano y la calle "Rivadavia" quedan excluidos (null)
    const excluidos = resultado.features.filter((f: { properties: { nombre_codigo: string | null } }) => f.properties.nombre_codigo === null)
    expect(excluidos).toHaveLength(2)

    // no se muta la colección de entrada
    expect(coleccion.features[0].properties).not.toHaveProperty('nombre_codigo')
  })
})

describe('generarSql', () => {
  test('genera un insert idempotente (where not exists) por código y municipio', () => {
    const sql = generarSql(['RP 62', '066-01'], 'maipu')
    expect(sql).toContain("insert into public.caminos (nombre_codigo, municipio)")
    expect(sql).toContain("('RP 62')")
    expect(sql).toContain("('066-01')")
    expect(sql).toContain("select v.nombre_codigo, 'maipu'")
    expect(sql).toContain('where not exists')
    expect(sql).toContain("c.municipio = 'maipu'")
  })

  test('escapa comillas simples en el código', () => {
    const sql = generarSql(["Caminos vecinales - O'Higgins"], 'maipu')
    expect(sql).toContain("('Caminos vecinales - O''Higgins')")
  })
})
