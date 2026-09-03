import { describe, expect, test } from 'vitest'
import {
  esquemaCamino,
  esquemaLogin,
  esquemaObservacion,
  esquemaRecorrido,
  esquemaRegistro,
  primerError,
} from '@/lib/validaciones'

describe('esquemaLogin', () => {
  test('acepta email y password válidos', () => {
    expect(esquemaLogin.safeParse({ email: 'a@b.com', password: '12345678' }).success).toBe(true)
  })
  test('rechaza email inválido', () => {
    const r = esquemaLogin.safeParse({ email: 'no', password: '12345678' })
    expect(r.success).toBe(false)
  })
})

describe('esquemaRegistro', () => {
  test('exige nombre y partido válido', () => {
    const r = esquemaRegistro.safeParse({
      email: 'a@b.com',
      password: '12345678',
      nombre: 'Ana',
      municipio_id: 'carlos-tejedor',
    })
    expect(r.success).toBe(true)
  })
  test('rechaza partido inexistente', () => {
    const r = esquemaRegistro.safeParse({
      email: 'a@b.com',
      password: '12345678',
      nombre: 'Ana',
      municipio_id: 'narnia',
    })
    expect(r.success).toBe(false)
  })
})

describe('esquemaCamino', () => {
  test('exige nombre_codigo de al menos 2 caracteres', () => {
    expect(esquemaCamino.safeParse({ nombre_codigo: 'A' }).success).toBe(false)
    expect(esquemaCamino.safeParse({ nombre_codigo: 'CR-01' }).success).toBe(true)
  })
})

describe('primerError', () => {
  test('devuelve solo el mensaje en español, sin nombre de campo', () => {
    const r = esquemaLogin.safeParse({ email: 'no', password: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(primerError(r.error)).toBe('Email inválido')
  })
})

const ID_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID_B = 'bbbbbbbb-0000-4000-8000-000000000002'

function observacion(extra: Record<string, unknown> = {}) {
  return {
    id: ID_B,
    tipo_falla: 'bache',
    severidad: 'alta',
    latitud: -37.1,
    longitud: -57.9,
    ...extra,
  }
}

function recorrido(extra: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    inicio: '2026-09-03T10:00:00.000Z',
    fin: '2026-09-03T11:00:00.000Z',
    puntosGps: 120,
    track: [
      [-37.1, -57.9],
      [-37.11, -57.91],
    ],
    observaciones: [],
    ...extra,
  }
}

describe('esquemaObservacion', () => {
  test('acepta una observacion minima', () => {
    expect(esquemaObservacion.safeParse(observacion()).success).toBe(true)
  })

  test('acepta los ocho tipos de falla', () => {
    const tipos = [
      'bache',
      'carcava',
      'acumulacion_agua',
      'falta_alcantarilla',
      'maleza_alta',
      'alcantarilla_rota',
      'senalizacion',
      'otro',
    ]
    for (const tipo_falla of tipos) {
      expect(esquemaObservacion.safeParse(observacion({ tipo_falla })).success).toBe(true)
    }
  })

  test('rechaza tipo, severidad y coordenadas fuera de rango', () => {
    expect(esquemaObservacion.safeParse(observacion({ tipo_falla: 'meteorito' })).success).toBe(false)
    expect(esquemaObservacion.safeParse(observacion({ severidad: 'critica' })).success).toBe(false)
    expect(esquemaObservacion.safeParse(observacion({ latitud: 91 })).success).toBe(false)
    expect(esquemaObservacion.safeParse(observacion({ longitud: -181 })).success).toBe(false)
  })

  test('recorta la descripcion y la limita a 500 caracteres', () => {
    const r = esquemaObservacion.safeParse(observacion({ descripcion: '  hola  ' }))
    expect(r.success && r.data.descripcion).toBe('hola')
    expect(esquemaObservacion.safeParse(observacion({ descripcion: 'x'.repeat(501) })).success).toBe(
      false,
    )
  })

  test('valida la evidencia adjunta', () => {
    expect(
      esquemaObservacion.safeParse(observacion({ evidencia: { ruta: 'u/r/a.jpg', tipo: 'imagen' } }))
        .success,
    ).toBe(true)
    expect(
      esquemaObservacion.safeParse(observacion({ evidencia: { ruta: '', tipo: 'imagen' } })).success,
    ).toBe(false)
    expect(
      esquemaObservacion.safeParse(observacion({ evidencia: { ruta: 'u/r/a.jpg', tipo: 'audio' } }))
        .success,
    ).toBe(false)
  })
})

describe('esquemaRecorrido', () => {
  test('acepta un recorrido valido', () => {
    expect(esquemaRecorrido.safeParse(recorrido()).success).toBe(true)
  })

  test('exige al menos dos puntos de track', () => {
    const r = esquemaRecorrido.safeParse(recorrido({ track: [[-37.1, -57.9]] }))
    expect(r.success).toBe(false)
    if (!r.success) expect(primerError(r.error)).toMatch(/al menos 2 puntos/)
  })

  test('rechaza mas de 20000 puntos', () => {
    const track = Array.from({ length: 20001 }, () => [-37.1, -57.9])
    expect(esquemaRecorrido.safeParse(recorrido({ track })).success).toBe(false)
  })

  test('rechaza fin anterior al inicio', () => {
    const r = esquemaRecorrido.safeParse(recorrido({ fin: '2026-09-03T09:00:00.000Z' }))
    expect(r.success).toBe(false)
    if (!r.success) expect(primerError(r.error)).toMatch(/anterior al inicio/)
  })

  test('acepta fin igual al inicio', () => {
    expect(esquemaRecorrido.safeParse(recorrido({ fin: '2026-09-03T10:00:00.000Z' })).success).toBe(
      true,
    )
  })

  test('rechaza fechas que no son ISO y puntosGps negativos', () => {
    expect(esquemaRecorrido.safeParse(recorrido({ inicio: '03/09/2026' })).success).toBe(false)
    expect(esquemaRecorrido.safeParse(recorrido({ puntosGps: -1 })).success).toBe(false)
  })

  test('acepta el recorrido sin el campo opcional puntos', () => {
    const r = esquemaRecorrido.safeParse(recorrido())
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.puntos).toBeUndefined()
  })

  test('acepta puntos gps crudos', () => {
    const puntos = [
      { lat: -37.1, lng: -57.9, t: 1756900000000, precision: 8 },
      { lat: -37.11, lng: -57.91, t: 1756900010000, precision: 12.5 },
    ]
    const r = esquemaRecorrido.safeParse(recorrido({ puntos }))
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.puntos).toEqual(puntos)
  })

  test('rechaza puntos gps mal formados', () => {
    expect(
      esquemaRecorrido.safeParse(recorrido({ puntos: [{ lat: 91, lng: 0, t: 1, precision: 5 }] }))
        .success,
    ).toBe(false)
    expect(
      esquemaRecorrido.safeParse(recorrido({ puntos: [{ lat: 0, lng: 0, t: 1.5, precision: 5 }] }))
        .success,
    ).toBe(false)
    expect(
      esquemaRecorrido.safeParse(recorrido({ puntos: [{ lat: 0, lng: 0, t: 1, precision: -1 }] }))
        .success,
    ).toBe(false)
    expect(esquemaRecorrido.safeParse(recorrido({ puntos: [{ lat: 0, lng: 0 }] })).success).toBe(
      false,
    )
  })

  test('rechaza mas de 20000 puntos gps crudos', () => {
    const puntos = Array.from({ length: 20001 }, () => ({ lat: 0, lng: 0, t: 1, precision: 5 }))
    expect(esquemaRecorrido.safeParse(recorrido({ puntos })).success).toBe(false)
  })

  test('rechaza mas de 200 observaciones', () => {
    const observaciones = Array.from({ length: 201 }, () => observacion())
    expect(esquemaRecorrido.safeParse(recorrido({ observaciones })).success).toBe(false)
  })
})
