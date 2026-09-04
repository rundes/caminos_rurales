import { describe, expect, test } from 'vitest'
import { resumirCobertura } from '@/lib/cobertura-resumen'

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
