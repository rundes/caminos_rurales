import { describe, expect, test } from 'vitest'
import type { TramoGeometria } from '@/lib/cobertura'
import {
  descripcionImpacto,
  filasImpactos,
  filasMuestras,
  kmPorCalidad,
} from '@/lib/recorrido-sensores-servidor'
import type { Contexto } from '@/lib/recorrido-servidor'
import { crearAsignadorTramos } from '@/lib/sensores/asignacion'
import type { CalidadSegmento } from '@/lib/sensores/tipos'
import type { MuestraPayload } from '@/lib/validaciones'

const CTX: Contexto = { usuarioId: 'u1', municipio: 'maipu', recorridoId: 'r1' }

const TRAMOS: TramoGeometria[] = [{ id: 'w1', km: 1.1, geometria: [[0, 0], [0.01, 0]] }]

const asignador = crearAsignadorTramos(TRAMOS)

function muestra(lng: number, calidad: CalidadSegmento = 'bueno'): MuestraPayload {
  return {
    t: 1_756_900_000_000,
    lat: 0,
    lng,
    velocidadKmh: 42,
    rumbo: null,
    altitud: null,
    rmsVertical: 0.8,
    picoVertical: 3.2,
    frenadas: 1,
    laterales: 2,
    muestras: 180,
    calidad,
  }
}

describe('kmPorCalidad', () => {
  test('reparte la distancia entre muestras según la calidad de la que cierra', () => {
    const km = kmPorCalidad([muestra(0), muestra(0.002), muestra(0.004, 'malo')])
    expect(km.bueno).toBeCloseTo(0.222, 3)
    expect(km.malo).toBeCloseTo(0.222, 3)
    expect(km.regular).toBe(0)
  })

  test('con menos de dos muestras no hay distancia que repartir', () => {
    expect(kmPorCalidad([])).toEqual({
      sin_dato: 0,
      bueno: 0,
      regular: 0,
      malo: 0,
      intransitable: 0,
    })
    expect(kmPorCalidad([muestra(0)]).bueno).toBe(0)
  })
})

describe('descripcionImpacto', () => {
  test('describe el pico con un decimal y la velocidad redondeada', () => {
    expect(descripcionImpacto({ t: 1, lat: 0, lng: 0, pico: 8, velocidadKmh: 33.4 })).toBe(
      'Impacto detectado: 8.0 m/s² a 33 km/h',
    )
  })
})

describe('filasMuestras', () => {
  test('mapea al esquema de la tabla y asigna el tramo más cercano', () => {
    const filas = filasMuestras(CTX, [muestra(0.004)], asignador)
    expect(filas).toEqual([
      {
        recorrido_id: 'r1',
        usuario_id: 'u1',
        tramo_id: 'w1',
        t: new Date(1_756_900_000_000).toISOString(),
        latitud: 0,
        longitud: 0.004,
        velocidad_kmh: 42,
        rumbo: null,
        altitud: null,
        rms_vertical: 0.8,
        pico_vertical: 3.2,
        frenadas: 1,
        laterales: 2,
        muestras: 180,
        calidad: 'bueno',
      },
    ])
  })

  test('deja el tramo en null si no hay ninguno cerca', () => {
    const filas = filasMuestras(CTX, [{ ...muestra(0), lat: -37.1, lng: -57.9 }], asignador)
    expect(filas[0].tramo_id).toBeNull()
  })
})

describe('filasImpactos', () => {
  test('arma la observación automática con severidad, magnitud y tramo', () => {
    const filas = filasImpactos(
      'r1',
      [{ t: 1_756_900_000_000, lat: 0, lng: 0.004, pico: 14, velocidadKmh: 51 }],
      asignador,
    )
    expect(filas).toEqual([
      {
        recorrido_id: 'r1',
        tipo_falla: 'bache',
        severidad: 'alta',
        latitud: 0,
        longitud: 0.004,
        descripcion: 'Impacto detectado: 14.0 m/s² a 51 km/h',
        origen: 'sensor',
        magnitud: 14,
        tramo_id: 'w1',
      },
    ])
  })
})
