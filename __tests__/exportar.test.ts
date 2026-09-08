import { describe, expect, test } from 'vitest'
import { aCsv, aGeoJson } from '@/lib/exportar'

describe('aCsv', () => {
  test('arranca con el BOM UTF-8', () => {
    const csv = aCsv([{ id: '1' }])
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })

  test('sin filas devuelve solo el BOM', () => {
    expect(aCsv([])).toBe('﻿')
  })

  test('encabezado sale de las claves de la primera fila', () => {
    const csv = aCsv([{ id: '1', nombre: 'a' }])
    expect(csv).toBe('﻿id,nombre\r\n1,a')
  })

  test('separa filas con CRLF', () => {
    const csv = aCsv([{ id: '1' }, { id: '2' }])
    expect(csv).toBe('﻿id\r\n1\r\n2')
  })

  test('entrecomilla campos con coma', () => {
    const csv = aCsv([{ nombre: 'Ruta 1, tramo norte' }])
    expect(csv).toBe('﻿nombre\r\n"Ruta 1, tramo norte"')
  })

  test('entrecomilla y duplica comillas internas', () => {
    const csv = aCsv([{ nota: 'dijo "andá despacio"' }])
    expect(csv).toBe('﻿nota\r\n"dijo ""andá despacio"""')
  })

  test('entrecomilla campos con salto de línea', () => {
    const csv = aCsv([{ nota: 'línea 1\nlínea 2' }])
    expect(csv).toBe('﻿nota\r\n"línea 1\nlínea 2"')
  })

  test('null y undefined se exportan como celda vacía', () => {
    const csv = aCsv([{ a: null, b: undefined }])
    expect(csv).toBe('﻿a,b\r\n,')
  })

  test('no entrecomilla campos sin caracteres especiales', () => {
    const csv = aCsv([{ tipo: 'bache', km: 5.2, activo: true }])
    expect(csv).toBe('﻿tipo,km,activo\r\nbache,5.2,true')
  })
})

describe('aGeoJson', () => {
  test('arma un FeatureCollection de puntos con [longitud, latitud]', () => {
    const geo = aGeoJson([{ latitud: -36.9, longitud: -57.6, propiedades: { id: 'o1' } }])
    expect(geo).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-57.6, -36.9] },
          properties: { id: 'o1' },
        },
      ],
    })
  })

  test('sin filas devuelve un FeatureCollection vacío', () => {
    expect(aGeoJson([])).toEqual({ type: 'FeatureCollection', features: [] })
  })

  test('conserva las propiedades de cada fila', () => {
    const geo = aGeoJson([
      { latitud: 1, longitud: 2, propiedades: { estado: 'pendiente', km: 3.4, cubierto: false } },
    ])
    expect(geo.features[0].properties).toEqual({ estado: 'pendiente', km: 3.4, cubierto: false })
  })
})
