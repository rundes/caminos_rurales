import { describe, expect, test } from 'vitest'
import { expandirCaja, regionesABloquear } from '../regiones'
import type { RegionDetectada } from '../tipos'

describe('expandirCaja', () => {
  test('agrega el margen a cada lado, proporcional al tamaño de la caja', () => {
    const caja = { x: 100, y: 100, ancho: 40, alto: 20 }

    const expandida = expandirCaja(caja, 0.25, 1000, 1000)

    // Margen: 40*0.25=10 en x, 20*0.25=5 en y.
    expect(expandida).toEqual({ x: 90, y: 95, ancho: 60, alto: 30 })
  })

  test('recorta al borde de la imagen sin pasarse', () => {
    const caja = { x: 5, y: 990, ancho: 20, alto: 20 }

    const expandida = expandirCaja(caja, 0.5, 1000, 1000)

    expect(expandida.x).toBe(0)
    expect(expandida.y).toBeGreaterThanOrEqual(980)
    expect(expandida.x + expandida.ancho).toBeLessThanOrEqual(1000)
    expect(expandida.y + expandida.alto).toBeLessThanOrEqual(1000)
  })

  test('con margen 0 devuelve la misma caja', () => {
    const caja = { x: 10, y: 10, ancho: 30, alto: 30 }
    expect(expandirCaja(caja, 0, 1000, 1000)).toEqual(caja)
  })
})

describe('regionesABloquear', () => {
  const ANCHO = 1280
  const ALTO = 720

  function deteccion(parcial: Partial<RegionDetectada>): RegionDetectada {
    return {
      caja: { x: 100, y: 100, ancho: 50, alto: 50 },
      tipo: 'cara',
      confianza: 1,
      ...parcial,
    }
  }

  test('descarta detecciones por debajo del umbral de confianza de su tipo', () => {
    const detecciones = [
      deteccion({ tipo: 'cara', confianza: 0.3 }), // < 0.7
      deteccion({ tipo: 'persona', confianza: 0.3 }), // < 0.5
      deteccion({ tipo: 'vehiculo', confianza: 0.9 }),
    ]

    const cajas = regionesABloquear(detecciones, ANCHO, ALTO)

    expect(cajas).toHaveLength(1)
  })

  test('expande cada caja aceptada con el margen dado', () => {
    const detecciones = [deteccion({ caja: { x: 100, y: 100, ancho: 40, alto: 40 } })]

    const cajas = regionesABloquear(detecciones, ANCHO, ALTO, 0.5)

    expect(cajas[0]).toEqual({ x: 80, y: 80, ancho: 60, alto: 60 })
  })

  test('descarta cajas que quedan sin área tras recortar a la imagen', () => {
    const detecciones = [deteccion({ caja: { x: ANCHO + 10, y: 10, ancho: 20, alto: 20 } })]

    expect(regionesABloquear(detecciones, ANCHO, ALTO)).toEqual([])
  })

  test('sin detecciones no hay nada que bloquear', () => {
    expect(regionesABloquear([], ANCHO, ALTO)).toEqual([])
  })
})
