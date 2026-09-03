import { describe, expect, test } from 'vitest'
import { aPuntos, filtrarPuntos, municipiosDe } from '@/lib/fallas'

const filas = [
  {
    id: 'f1',
    tipo_falla: 'bache' as const,
    severidad: 'alta' as const,
    latitud: -35.1,
    longitud: -60.1,
    url_evidencia_imagen: null,
    created_at: '2026-01-01T00:00:00Z',
    relevamientos: { fecha: '2026-01-02T00:00:00Z', caminos: { municipio: 'carlos-tejedor' } },
  },
  {
    id: 'f2',
    tipo_falla: 'maleza_alta' as const,
    severidad: 'baja' as const,
    latitud: -35.2,
    longitud: -60.2,
    url_evidencia_imagen: 'u/r/a.jpg',
    created_at: '2026-01-01T00:00:00Z',
    relevamientos: null,
  },
]

describe('aPuntos', () => {
  test('convierte filas anidadas a puntos planos', () => {
    const puntos = aPuntos(filas)
    expect(puntos[0]).toMatchObject({ id: 'f1', municipio: 'carlos-tejedor', fecha: '2026-01-02T00:00:00Z' })
    expect(puntos[1].municipio).toBe('desconocido')
  })
})

describe('filtrarPuntos', () => {
  test('filtra por tipo y municipio', () => {
    const puntos = aPuntos(filas)
    expect(filtrarPuntos(puntos, { tipo: 'bache' })).toHaveLength(1)
    expect(filtrarPuntos(puntos, { municipio: 'carlos-tejedor' })).toHaveLength(1)
    expect(filtrarPuntos(puntos, {})).toHaveLength(2)
  })
})

describe('municipiosDe', () => {
  test('lista municipios únicos ordenados', () => {
    expect(municipiosDe(aPuntos(filas))).toEqual(['carlos-tejedor', 'desconocido'])
  })
})
