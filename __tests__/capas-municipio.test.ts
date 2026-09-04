import { describe, expect, test } from 'vitest'
import {
  decodificarRed,
  ensamblarAnillo,
  kmDeLineas,
  recortarLineas,
} from '../scripts/lib/capas-municipio.mjs'

describe('ensamblarAnillo', () => {
  test('ensambla tramos conectados en un anillo cerrado', () => {
    const cuadrado = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [1, 1],
      ],
      [
        [1, 1],
        [0, 1],
      ],
      [
        [0, 1],
        [0, 0],
      ],
    ]
    expect(ensamblarAnillo(cuadrado)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ])
  })

  test('ensambla tramos con orientación invertida', () => {
    const cuadrado = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 1],
        [1, 0],
      ],
      [
        [1, 1],
        [0, 1],
      ],
      [
        [0, 1],
        [0, 0],
      ],
    ]
    expect(ensamblarAnillo(cuadrado)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ])
  })

  test('lanza si los tramos no cierran', () => {
    const abierto = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [1, 0],
        [1, 1],
      ],
    ]
    expect(() => ensamblarAnillo(abierto)).toThrow()
  })

  test('lanza si los tramos están desconectados', () => {
    const desconectado = [
      [
        [0, 0],
        [1, 0],
      ],
      [
        [5, 5],
        [6, 6],
      ],
    ]
    expect(() => ensamblarAnillo(desconectado)).toThrow()
  })

  test('lanza si no se pasan tramos', () => {
    expect(() => ensamblarAnillo([])).toThrow()
  })
})

describe('recortarLineas', () => {
  const anillo: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]

  test('mantiene la corrida dentro más un vecino de borde a cada lado', () => {
    const feature = {
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-5, 5],
            [2, 5],
            [5, 5],
            [8, 5],
            [15, 5],
          ],
        ],
      },
    }
    expect(recortarLineas(feature, anillo)).toEqual([
      [
        [-5, 5],
        [2, 5],
        [5, 5],
        [8, 5],
        [15, 5],
      ],
    ])
  })

  test('descarta líneas totalmente fuera del polígono', () => {
    const feature = {
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [20, 20],
            [30, 30],
          ],
        ],
      },
    }
    expect(recortarLineas(feature, anillo)).toEqual([])
  })

  test('descarta corridas de un solo punto sin vecinos', () => {
    const feature = {
      properties: {},
      geometry: { type: 'MultiLineString', coordinates: [[[5, 5]]] },
    }
    expect(recortarLineas(feature, anillo)).toEqual([])
  })

  test('separa múltiples corridas dentro de una misma línea en segmentos distintos', () => {
    const feature = {
      properties: {},
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [
            [-5, 5],
            [2, 5],
            [-1, 5],
            [3, 5],
            [6, 5],
            [15, 5],
          ],
        ],
      },
    }
    expect(recortarLineas(feature, anillo)).toEqual([
      [
        [-5, 5],
        [2, 5],
        [-1, 5],
      ],
      [
        [-1, 5],
        [3, 5],
        [6, 5],
        [15, 5],
      ],
    ])
  })
})

describe('decodificarRed', () => {
  test('decodifica una autovía pavimentada', () => {
    expect(decodificarRed({ gid: 1, rtn: '2', typ: 47, rst: 1, fdc: 'DVP Buenos Aires' })).toEqual({
      gid: 1,
      ruta: '2',
      tipo: 'autovía',
      superficie: 'pavimentado',
      fuente: 'DVP Buenos Aires',
    })
  })

  test('decodifica una ruta provincial de tierra', () => {
    expect(decodificarRed({ gid: 2, rtn: '205', typ: 40, rst: 3, fdc: 'DVP Buenos Aires' })).toEqual({
      gid: 2,
      ruta: '205',
      tipo: 'ruta provincial',
      superficie: 'tierra',
      fuente: 'DVP Buenos Aires',
    })
  })

  test('decodifica consolidado', () => {
    expect(decodificarRed({ gid: 3, rtn: '36', typ: 40, rst: 2, fdc: 'DVP Buenos Aires' }).superficie).toBe(
      'consolidado',
    )
  })

  test('usa el valor crudo si typ o rst son desconocidos', () => {
    expect(decodificarRed({ gid: 4, rtn: '1', typ: 99, rst: 9, fdc: 'X' })).toEqual({
      gid: 4,
      ruta: '1',
      tipo: '99',
      superficie: '9',
      fuente: 'X',
    })
  })
})

describe('kmDeLineas', () => {
  test('suma la distancia haversine de una línea', () => {
    const km = kmDeLineas([
      [
        [0, 0],
        [0, 1],
      ],
    ])
    expect(km).toBeCloseTo(111.19, 0)
  })

  test('suma varias líneas', () => {
    const km = kmDeLineas([
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [1, 0],
      ],
    ])
    expect(km).toBeGreaterThan(200)
  })

  test('devuelve 0 para una lista vacía', () => {
    expect(kmDeLineas([])).toBe(0)
  })
})
