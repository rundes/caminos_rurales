import { describe, expect, test } from 'vitest'
import {
  aCoberturaPorLocalidad,
  contarConEvidencia,
  coordenadasDeTrack,
  filaObservacion,
  fraccionCubierta,
  partirCobertura,
  type FilaCoberturaLocalidad,
  type TramoMunicipio,
} from '@/lib/recorrido-servidor'
import type { Observacion } from '@/lib/validaciones'

const TRAMOS: TramoMunicipio[] = [
  { id: 'w1', km: 2, localidad: 'Segurola', geometria: [] },
  { id: 'w2', km: 3, localidad: 'Segurola', geometria: [] },
  { id: 'w3', km: 5, localidad: 'Monsalvo', geometria: [] },
]

const FILAS: FilaCoberturaLocalidad[] = [
  { localidad: 'Segurola', tramos: 2, cubiertos: 2, km: 5, km_cubiertos: 5 },
  { localidad: 'Monsalvo', tramos: 1, cubiertos: 0, km: 5, km_cubiertos: 0 },
]

function observacion(extra: Partial<Observacion> = {}): Observacion {
  return {
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    tipo_falla: 'bache',
    severidad: 'alta',
    latitud: -37.1,
    longitud: -57.9,
    ...extra,
  }
}

describe('coordenadasDeTrack', () => {
  test('convierte pares [lat, lng] a coordenadas', () => {
    expect(coordenadasDeTrack([[-37.1, -57.9]])).toEqual([{ lat: -37.1, lng: -57.9 }])
  })
})

describe('partirCobertura', () => {
  test('separa nuevos y repetidos sumando los km de cada grupo', () => {
    const r = partirCobertura(TRAMOS, ['w1', 'w2', 'w3'], new Set(['w2']))
    expect(r.nuevos).toEqual(['w1', 'w3'])
    expect(r.repetidos).toEqual(['w2'])
    expect(r.kmNuevos).toBe(7)
    expect(r.kmRepetidos).toBe(3)
  })

  test('ignora km de tramos desconocidos y no rompe sin cubiertos', () => {
    expect(partirCobertura(TRAMOS, ['fantasma'], new Set()).kmNuevos).toBe(0)
    expect(partirCobertura(TRAMOS, [], new Set())).toEqual({
      nuevos: [],
      repetidos: [],
      kmNuevos: 0,
      kmRepetidos: 0,
    })
  })
})

describe('fraccionCubierta', () => {
  test('divide km cubiertos sobre km totales', () => {
    expect(fraccionCubierta(FILAS)).toBe(0.5)
  })

  test('devuelve 0 si el municipio no tiene km', () => {
    expect(fraccionCubierta([])).toBe(0)
  })
})

describe('aCoberturaPorLocalidad', () => {
  test('deja solo localidad, tramos y cubiertos', () => {
    expect(aCoberturaPorLocalidad(FILAS)).toEqual([
      { localidad: 'Segurola', tramos: 2, cubiertos: 2 },
      { localidad: 'Monsalvo', tramos: 1, cubiertos: 0 },
    ])
  })
})

describe('filaObservacion', () => {
  test('sin evidencia deja ambas columnas en null', () => {
    const fila = filaObservacion('r1', observacion())
    expect(fila).toMatchObject({
      recorrido_id: 'r1',
      descripcion: null,
      url_evidencia_imagen: null,
      url_evidencia_video: null,
    })
  })

  test('la evidencia va a la columna de imagen o de video segun el tipo', () => {
    const imagen = filaObservacion('r1', observacion({ evidencia: { ruta: 'a.jpg', tipo: 'imagen' } }))
    expect(imagen.url_evidencia_imagen).toBe('a.jpg')
    expect(imagen.url_evidencia_video).toBeNull()

    const video = filaObservacion('r1', observacion({ evidencia: { ruta: 'a.mp4', tipo: 'video' } }))
    expect(video.url_evidencia_video).toBe('a.mp4')
    expect(video.url_evidencia_imagen).toBeNull()
  })
})

describe('contarConEvidencia', () => {
  test('cuenta solo las observaciones con archivo adjunto', () => {
    expect(
      contarConEvidencia([
        observacion(),
        observacion({ evidencia: { ruta: 'a.jpg', tipo: 'imagen' } }),
        observacion({ evidencia: { ruta: 'b.mp4', tipo: 'video' } }),
      ]),
    ).toBe(2)
  })
})
