import { describe, expect, test } from 'vitest'
import { calidadDeSegmento, normalizarMuestra, severidadDeImpacto } from '@/lib/sensores/calidad'
import {
  MUESTRAS_MINIMAS_SEGMENTO,
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

describe('normalizarMuestra', () => {
  function segmento(extra: Record<string, unknown> = {}) {
    return {
      muestras: 40,
      rmsVertical: 0.5,
      velocidadKmh: 60,
      calidad: 'bueno' as const,
      ...extra,
    }
  }

  test('con menos del piso de eventos de movimiento queda sin_dato pese al valor del cliente', () => {
    const normalizada = normalizarMuestra(segmento({ muestras: 0, calidad: 'bueno' }))
    expect(normalizada.calidad).toBe('sin_dato')
  })

  test('justo debajo del piso queda sin_dato; justo en el piso ya clasifica', () => {
    expect(
      normalizarMuestra(segmento({ muestras: MUESTRAS_MINIMAS_SEGMENTO - 1 })).calidad,
    ).toBe('sin_dato')
    expect(
      normalizarMuestra(segmento({ muestras: MUESTRAS_MINIMAS_SEGMENTO })).calidad,
    ).toBe('bueno')
  })

  test('con datos suficientes recalcula desde rms y velocidad, ignorando la calidad del cliente', () => {
    const normalizada = normalizarMuestra(
      segmento({ muestras: 40, rmsVertical: 0.5, velocidadKmh: 60, calidad: 'intransitable' }),
    )
    expect(normalizada.calidad).toBe('bueno')
  })

  test('la calidad que manda el cliente nunca se usa, aunque diga lo peor', () => {
    const normalizada = normalizarMuestra(
      segmento({ muestras: 40, rmsVertical: 0.3, calidad: 'intransitable' }),
    )
    expect(normalizada.calidad).toBe('bueno')
  })

  test('no muta el objeto original', () => {
    const original = segmento({ muestras: 0, calidad: 'bueno' })
    normalizarMuestra(original)
    expect(original.calidad).toBe('bueno')
  })
})
