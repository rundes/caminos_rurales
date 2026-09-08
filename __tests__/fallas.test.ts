import { describe, expect, test } from 'vitest'
import { aPuntos, filtrarPuntos, filtroValido } from '@/lib/fallas'

const filas = [
  {
    id: 'f1',
    tipo_falla: 'bache' as const,
    severidad: 'alta' as const,
    latitud: -35.1,
    longitud: -60.1,
    url_evidencia_imagen: null,
    url_evidencia_video: 'u/r/a.webm',
    created_at: '2026-01-01T00:00:00Z',
    recorridos: { inicio: '2026-01-02T00:00:00Z', municipio: 'carlos-tejedor' },
    origen: 'manual' as const,
    magnitud: null,
    estado: 'pendiente' as const,
  },
  {
    id: 'f2',
    tipo_falla: 'maleza_alta' as const,
    severidad: 'baja' as const,
    latitud: -35.2,
    longitud: -60.2,
    url_evidencia_imagen: 'u/r/a.jpg',
    url_evidencia_video: null,
    created_at: '2026-01-05T00:00:00Z',
    recorridos: null,
    origen: 'sensor' as const,
    magnitud: 7.4,
    estado: 'resuelta' as const,
  },
]

describe('aPuntos', () => {
  test('convierte filas anidadas a puntos planos', () => {
    const puntos = aPuntos(filas)
    expect(puntos[0]).toMatchObject({ id: 'f1', municipio: 'carlos-tejedor', fecha: '2026-01-02T00:00:00Z' })
    expect(puntos[1].municipio).toBe('desconocido')
  })

  test('conserva la url de evidencia en video, null cuando no hay', () => {
    const puntos = aPuntos(filas)
    expect(puntos[0].url_evidencia_video).toBe('u/r/a.webm')
    expect(puntos[1].url_evidencia_video).toBeNull()
  })

  test('mapea origen y magnitud', () => {
    const puntos = aPuntos(filas)
    expect(puntos[0].origen).toBe('manual')
    expect(puntos[0].magnitud).toBeNull()
    expect(puntos[1].origen).toBe('sensor')
    expect(puntos[1].magnitud).toBe(7.4)
  })

  test('mapea el estado de gestión', () => {
    const puntos = aPuntos(filas)
    expect(puntos[0].estado).toBe('pendiente')
    expect(puntos[1].estado).toBe('resuelta')
  })
})

describe('filtrarPuntos', () => {
  test('filtra por tipo', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { tipo: 'bache' })).toHaveLength(1)
    expect(filtrarPuntos(puntos, {})).toHaveLength(2)
  })

  test('filtra por severidad', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { severidad: 'alta' })).toHaveLength(1)
    expect(filtrarPuntos(puntos, { severidad: 'baja' })[0].id).toBe('f2')
  })

  test('filtra por origen', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { origen: 'sensor' })).toEqual([puntos[1]])
    expect(filtrarPuntos(puntos, { origen: 'manual' })).toEqual([puntos[0]])
  })

  test('filtra por estado', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { estado: 'pendiente' })).toEqual([puntos[0]])
    expect(filtrarPuntos(puntos, { estado: 'resuelta' })).toEqual([puntos[1]])
  })

  test('filtra por rango de fechas (desde/hasta, sin hora)', () => {
    const puntos = aPuntos(filas)
    // f1: 2026-01-02, f2: 2026-01-05 (sin recorrido, usa created_at)
    expect(filtrarPuntos(puntos, { desde: '2026-01-03' })).toEqual([puntos[1]])
    expect(filtrarPuntos(puntos, { hasta: '2026-01-03' })).toEqual([puntos[0]])
    expect(filtrarPuntos(puntos, { desde: '2026-01-02', hasta: '2026-01-02' })).toEqual([puntos[0]])
  })

  test('hasta es inclusivo del día completo, no corta a medianoche', () => {
    const puntos = aPuntos(filas)
    // f2 cae el 2026-01-05T00:00:00Z: un hasta del mismo día debe incluirlo.
    expect(filtrarPuntos(puntos, { hasta: '2026-01-05' })).toHaveLength(2)
  })

  test('combina varios filtros con semántica AND', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { tipo: 'bache', origen: 'sensor' })).toHaveLength(0)
    expect(filtrarPuntos(puntos, { tipo: 'bache', origen: 'manual', estado: 'pendiente' })).toEqual([puntos[0]])
  })
})

describe('filtroValido', () => {
  test('devuelve el valor si está entre los permitidos', () => {
    expect(filtroValido('bache', ['bache', 'carcava'])).toBe('bache')
  })

  test('devuelve undefined si no vino', () => {
    expect(filtroValido(undefined, ['bache', 'carcava'])).toBeUndefined()
    expect(filtroValido('', ['bache', 'carcava'])).toBeUndefined()
  })

  test('devuelve undefined ante un valor arbitrario que no pertenece al enum (evita romper .eq() tipado)', () => {
    expect(filtroValido('drop-table', ['bache', 'carcava'])).toBeUndefined()
  })
})
