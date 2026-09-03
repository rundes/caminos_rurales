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
    recorridos: { inicio: '2026-01-02T00:00:00Z', municipio: 'carlos-tejedor' },
  },
  {
    id: 'f2',
    tipo_falla: 'maleza_alta' as const,
    severidad: 'baja' as const,
    latitud: -35.2,
    longitud: -60.2,
    url_evidencia_imagen: 'u/r/a.jpg',
    created_at: '2026-01-01T00:00:00Z',
    recorridos: null,
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

  test('aplica tipo y municipio con semántica AND: solo matchea el punto que cumple ambos', () => {
    const puntos = aPuntos(filas)
    // f1 es bache + carlos-tejedor. f2 es maleza_alta + desconocido.
    expect(filtrarPuntos(puntos, { tipo: 'bache', municipio: 'carlos-tejedor' })).toHaveLength(1)
  })

  test('con AND, un punto que cumple solo un filtro no matchea', () => {
    const puntos = aPuntos(filas)
    // f1 cumple tipo pero no el municipio de f2; f2 cumple el municipio pero no el tipo de f1.
    expect(filtrarPuntos(puntos, { tipo: 'bache', municipio: 'desconocido' })).toHaveLength(0)
    expect(filtrarPuntos(puntos, { tipo: 'maleza_alta', municipio: 'carlos-tejedor' })).toHaveLength(0)
  })
})

describe('municipiosDe', () => {
  test('lista municipios únicos ordenados', () => {
    expect(municipiosDe(aPuntos(filas))).toEqual(['carlos-tejedor', 'desconocido'])
  })
})
