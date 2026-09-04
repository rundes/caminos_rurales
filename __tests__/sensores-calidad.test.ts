import { describe, expect, test } from 'vitest'
import { calidadDeSegmento, severidadDeImpacto } from '@/lib/sensores/calidad'
import {
  PICO_SEVERIDAD_ALTA,
  PICO_SEVERIDAD_MEDIA,
  RMS_BUENO,
  RMS_MALO,
  RMS_REGULAR,
  VELOCIDAD_MINIMA_KMH,
} from '@/lib/sensores/umbrales'

describe('calidadDeSegmento', () => {
  test('debajo de la velocidad mínima no clasifica, por liso que venga', () => {
    expect(calidadDeSegmento(0.1, VELOCIDAD_MINIMA_KMH - 0.1)).toBe('sin_dato')
    expect(calidadDeSegmento(0.1, 0)).toBe('sin_dato')
  })

  test('justo en la velocidad mínima ya clasifica', () => {
    expect(calidadDeSegmento(0.1, VELOCIDAD_MINIMA_KMH)).toBe('bueno')
  })

  test('los bordes de cada umbral caen en la calidad peor', () => {
    expect(calidadDeSegmento(RMS_BUENO - 0.001, 40)).toBe('bueno')
    expect(calidadDeSegmento(RMS_BUENO, 40)).toBe('regular')
    expect(calidadDeSegmento(RMS_REGULAR - 0.001, 40)).toBe('regular')
    expect(calidadDeSegmento(RMS_REGULAR, 40)).toBe('malo')
    expect(calidadDeSegmento(RMS_MALO - 0.001, 40)).toBe('malo')
    expect(calidadDeSegmento(RMS_MALO, 40)).toBe('intransitable')
  })

  test('valores no numéricos o negativos quedan sin dato', () => {
    expect(calidadDeSegmento(Number.NaN, 40)).toBe('sin_dato')
    expect(calidadDeSegmento(1, Number.NaN)).toBe('sin_dato')
    expect(calidadDeSegmento(Number.POSITIVE_INFINITY, 40)).toBe('sin_dato')
    expect(calidadDeSegmento(-1, 40)).toBe('sin_dato')
  })
})

describe('severidadDeImpacto', () => {
  test('los bordes de cada umbral caen en la severidad mayor', () => {
    expect(severidadDeImpacto(PICO_SEVERIDAD_MEDIA - 0.001)).toBe('baja')
    expect(severidadDeImpacto(PICO_SEVERIDAD_MEDIA)).toBe('media')
    expect(severidadDeImpacto(PICO_SEVERIDAD_ALTA - 0.001)).toBe('media')
    expect(severidadDeImpacto(PICO_SEVERIDAD_ALTA)).toBe('alta')
  })

  test('un pico enorme sigue siendo alta', () => {
    expect(severidadDeImpacto(120)).toBe('alta')
  })
})
