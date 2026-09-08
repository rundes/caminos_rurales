import { describe, expect, test } from 'vitest'
import { formatearKm, formatearPorcentaje, porcentajeCobertura, resumirCobertura } from '@/lib/cobertura-resumen'

describe('resumirCobertura', () => {
  test('normaliza filas numéricas que llegan como string y calcula los totales', () => {
    const resumen = resumirCobertura([
      { localidad: 'Maipú', tramos: 10, cubiertos: 4, km: '40.5', km_cubiertos: '16.2' },
      { localidad: 'Franklin', tramos: 5, cubiertos: 5, km: '20.0', km_cubiertos: '20.0' },
    ])

    expect(resumen.porLocalidad).toEqual([
      { localidad: 'Maipú', tramos: 10, cubiertos: 4, km: 40.5, kmCubiertos: 16.2 },
      { localidad: 'Franklin', tramos: 5, cubiertos: 5, km: 20, kmCubiertos: 20 },
    ])
    expect(resumen.total).toEqual({ tramos: 15, cubiertos: 9, km: 60.5, kmCubiertos: 36.2, fraccion: 9 / 15 })
  })

  test('acepta filas con números nativos', () => {
    const resumen = resumirCobertura([{ localidad: 'Maipú', tramos: 2, cubiertos: 1, km: 5, km_cubiertos: 2.5 }])
    expect(resumen.total).toEqual({ tramos: 2, cubiertos: 1, km: 5, kmCubiertos: 2.5, fraccion: 0.5 })
  })

  test('sin filas devuelve totales en cero y fracción cero', () => {
    const resumen = resumirCobertura([])
    expect(resumen.porLocalidad).toEqual([])
    expect(resumen.total).toEqual({ tramos: 0, cubiertos: 0, km: 0, kmCubiertos: 0, fraccion: 0 })
  })

  test('coerce valores no numéricos a cero en vez de propagar NaN', () => {
    const resumen = resumirCobertura([
      { localidad: 'Maipú', tramos: 3, cubiertos: 1, km: 'no-es-numero', km_cubiertos: null as unknown as string },
    ])
    expect(resumen.porLocalidad[0]).toEqual({ localidad: 'Maipú', tramos: 3, cubiertos: 1, km: 0, kmCubiertos: 0 })
  })
})

describe('porcentajeCobertura', () => {
  test('calcula el % de km cubiertos, redondeado', () => {
    expect(porcentajeCobertura(45, 70)).toBe(64)
    expect(porcentajeCobertura(20, 20)).toBe(100)
    expect(porcentajeCobertura(0, 20)).toBe(0)
  })

  test('sin km totales, no divide por cero', () => {
    expect(porcentajeCobertura(0, 0)).toBe(0)
    expect(porcentajeCobertura(5, 0)).toBe(0)
  })

  test('km totales negativo se trata como sin datos', () => {
    expect(porcentajeCobertura(5, -1)).toBe(0)
  })
})

describe('formatearKm', () => {
  test('formatea con un decimal en es-AR', () => {
    expect(formatearKm(45)).toBe('45,0')
    expect(formatearKm(45.678)).toBe('45,7')
    expect(formatearKm(0)).toBe('0,0')
  })
})

describe('formatearPorcentaje', () => {
  test('formatea sin decimales en es-AR', () => {
    expect(formatearPorcentaje(64)).toBe('64')
    expect(formatearPorcentaje(0)).toBe('0')
    expect(formatearPorcentaje(100)).toBe('100')
  })
})
